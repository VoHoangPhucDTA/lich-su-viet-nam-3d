# V12 Flyway History Remediation

## 1. Mục đích và trạng thái

Tài liệu này mô tả cách xử lý sai lệch **metadata-only** của migration V12. Phạm vi
thay đổi chỉ là cột `script` của đúng một hàng trong `flyway_schema_history`; không chạy
`flyway repair`, không sửa migration V1-V34, không tạo V35 và không chạy lại DDL/DML
nghiệp vụ.

Quy trình đã được kiểm chứng trên database clone disposable. **Chưa áp dụng bất kỳ thay
đổi nào lên configured TiDB.** Phase 7 vẫn bị khóa cho tới khi một người có thẩm quyền
phê duyệt riêng việc áp dụng thủ công.

## 2. An toàn secret

- Credential đã từng xuất hiện trong output cũ được coi là đã lộ và không được dùng lại.
- Lần kiểm chứng này không đọc hoặc in toàn bộ file `.env`.
- `backend/.env` đang được Git ignore; repository chỉ track các file `.env.example`.
- Quét source/script theo các pattern datasource password và credential nhúng trong URL
  không phát hiện credential database được hardcode. Các kết quả khớp chỉ là test H2 với
  password rỗng và logic xử lý password.
- Configured TiDB không được kết nối trong lần kiểm chứng này. Clone dùng MySQL cục bộ,
  bind vào `127.0.0.1`, không dùng credential TiDB.
- Khi áp dụng thật, URL, username và password phải được lấy từ secret store hoặc biến môi
  trường đã rotate. Không đưa password vào URL, command history, tài liệu hoặc log.

## 3. Bằng chứng V12 và V34

### 3.1 Source hiện tại

| Version | File source | Flyway checksum | Nghiệp vụ |
|---|---|---:|---|
| V12 | `V12__nullable_event_chronology.sql` | `471765287` | Cho phép chronology nullable, đổi các giá trị năm `0` thành `NULL`, thêm ba check constraint chống giá trị `0`. |
| V34 | `V34__expand_event_geo_type_enum.sql` | `65777660` | Mở rộng `historical_events.geo_type` với `point`, `multi_point`, `multi_polygon`, `mixed`. |

Nội dung text của V12 hiện tại trùng với V12 chronology trên `origin/main`. Nội dung text
của V34 hiện tại trùng với migration enum từng mang tên V12 trong lịch sử Git.

### 3.2 Bằng chứng ledger đã biết của configured TiDB

Audit read-only trước remediation ghi nhận:

| Version | Description | Script | Checksum | Success |
|---|---|---|---:|---:|
| 12 | `nullable event chronology` | `V12__expand_event_geo_type_enum.sql` | `471765287` | `true` |
| 34 | `expand event geo type enum` | `V34__expand_event_geo_type_enum.sql` | `65777660` | `true` |

Không có bằng chứng đủ để kết luận ai đã sửa metadata V12 trước đây. Không suy đoán nguồn
gốc của thay đổi.

Historical `RemoteFlywayBridgeContractTest` trên `origin/main` xác nhận repository V12 và
remote V12 từng xung đột. Test yêu cầu bridge forward-only và cấm `INSERT`, `UPDATE` hoặc
`DELETE` đối với `flyway_schema_history`. Migration
`V14__nullable_event_chronology_remote_bridge.sql` chỉ lặp lại chronology DDL/DML cần
thiết; nó không chỉnh ledger. Vì vậy bridge giải thích cách chronology có thể tồn tại,
nhưng không giải thích việc cột `script` của V12 mang filename enum trong khi description
và checksum thuộc chronology.

## 4. Clone disposable

### 4.1 Cách dựng clone

- Engine: MySQL `8.4.10`, container `lsvn-v12-remediation-clone`.
- Network: chỉ publish vào `127.0.0.1` bằng port động.
- Schema được dựng từ đúng migration chain V1-V34 hiện tại.
- Sau khi Flyway tạo ledger chuẩn, clone fixture tái tạo chính xác mismatch bằng một
  transaction guarded đổi duy nhất V12 `script` từ filename chronology sang filename enum.
- Đây là **behavioral clone** phục vụ kiểm chứng ledger và schema, không phải bản sao dữ
  liệu của configured TiDB. Cách này tránh sử dụng lại credential đã lộ.

Backup ledger trước remediation được export tại:

```text
%TEMP%/lsvn-v12-remediation-evidence/flyway-history-before.sql
```

Các dump schema và business data trước/sau cũng nằm trong cùng thư mục tạm. Chúng không
chứa credential và không được đưa vào Git.

### 4.2 Precondition trên clone

Ngay trước remediation, V12 khớp đầy đủ điều kiện bắt buộc:

| Field | Value |
|---|---|
| `version` | `12` |
| `script` | `V12__expand_event_geo_type_enum.sql` |
| `description` | `nullable event chronology` |
| `checksum` | `471765287` |
| `success` | `true` |

V34 vẫn là `V34__expand_event_geo_type_enum.sql`, checksum `65777660`, success `true`.

Schema trước remediation đã có đầy đủ hiệu lực của cả hai migration:

- `start_year`, `end_year`, `effective_end_year` đều nullable.
- Ba constraint `chk_events_*_year_not_zero` đều tồn tại.
- `geo_type` chứa đủ tám giá trị enum, gồm bốn giá trị mở rộng của V34.

## 5. SQL remediation có guard

Người vận hành phải chạy toàn bộ block trong **một connection và một transaction**. Không
được tự động `COMMIT`. Chỉ `COMMIT` khi `updated_rows = 1` và hàng post-update khớp chính
xác; mọi trường hợp khác phải `ROLLBACK`.

```sql
START TRANSACTION;

SELECT
    installed_rank,
    version,
    description,
    script,
    checksum,
    installed_on,
    success
FROM flyway_schema_history
WHERE version = '12'
  AND script = 'V12__expand_event_geo_type_enum.sql'
  AND description = 'nullable event chronology'
  AND checksum = 471765287
  AND success = 1
FOR UPDATE;

UPDATE flyway_schema_history
SET script = 'V12__nullable_event_chronology.sql'
WHERE version = '12'
  AND script = 'V12__expand_event_geo_type_enum.sql'
  AND description = 'nullable event chronology'
  AND checksum = 471765287
  AND success = 1;

SELECT ROW_COUNT() AS updated_rows;

SELECT
    installed_rank,
    version,
    description,
    script,
    checksum,
    installed_on,
    success
FROM flyway_schema_history
WHERE version = '12'
FOR UPDATE;
```

Quyết định transaction:

```sql
-- Chỉ chạy khi updated_rows = 1 và post-update khớp chính xác:
COMMIT;

-- Nếu updated_rows khác 1 hoặc bất kỳ field nào ngoài script không đúng:
ROLLBACK;
```

Trong clone, client wrapper kiểm tra affected-row count trước commit. Lần chạy hợp lệ cập
nhật đúng `1` row. Lần chạy lặp lại cập nhật `0` row và wrapper rollback, chứng minh guard
idempotent theo hướng fail-closed.

## 6. Kết quả clone sau remediation

### 6.1 Row V12 trước và sau

| Field | Trước | Sau |
|---|---|---|
| `version` | `12` | `12` |
| `description` | `nullable event chronology` | Không đổi |
| `script` | `V12__expand_event_geo_type_enum.sql` | `V12__nullable_event_chronology.sql` |
| `checksum` | `471765287` | Không đổi |
| `success` | `true` | Không đổi |
| `installed_rank` / `installed_on` | Giá trị gốc | Không đổi |

Diff của hai ledger dump có đúng hai dòng dump khác nhau: một dòng chứa old script và một
dòng chứa new script. Không có field hoặc row nào khác thay đổi.

### 6.2 Validation và restart

| Check | Kết quả |
|---|---|
| Flyway 11.14.1 `validate` trước remediation | PASS, 34 migrations |
| Flyway 11.14.1 `info` trước remediation | V34, toàn bộ V1-V34 Success |
| Flyway 11.14.1 `validate` sau remediation | PASS, 34 migrations |
| Flyway 11.14.1 `info` sau remediation | V34, toàn bộ V1-V34 Success |
| Backend restart 1 | PASS; validate 34; V34 current; no migration; health HTTP 200/UP |
| Backend restart 2 | PASS; validate 34; V34 current; no migration; health HTTP 200/UP |
| `./mvnw clean test` | PASS; 31 tests, 0 failure, 0 error, 0 skipped |
| `./mvnw -DskipTests package` | PASS |

Health clone dùng runtime-only `management.health.mail.enabled=false` để loại SMTP ngoài
phạm vi; không sửa source hoặc cấu hình repository.

### 6.3 So sánh schema và dữ liệu

- SHA-256 của schema-only dump trước và sau giống nhau.
- SHA-256 của business-data dump trước và sau (loại trừ `flyway_schema_history`) giống nhau.
- Lần dump cuối sau hai restart vẫn giống baseline.
- Ledger vẫn có 34 row, max `installed_rank = 34`; timestamp migration cuối không đổi.
- Cả hai restart đều báo `Schema ... is up to date. No migration necessary.`

Kết luận: remediation chỉ thay metadata filename của V12; không migration nào chạy lại và
không có DDL/DML nghiệp vụ thay đổi.

## 7. Quy trình áp dụng thủ công lên configured TiDB

Chỉ người có thẩm quyền mới được thực hiện sau khi có phê duyệt riêng:

1. Rotate credential đã lộ và nạp credential mới từ secret store/biến môi trường.
2. Xác minh đang kết nối đúng database, đúng cluster và đúng schema bằng metadata không
   nhạy cảm; không in connection URL có credential.
3. Dừng hoặc drain mọi backend instance có thể đồng thời chạy Flyway.
4. Export riêng `flyway_schema_history` và lưu backup có access control.
5. Chạy read-only audit V12/V34 và schema chronology/enum. Dừng ngay nếu khác các
   precondition trong tài liệu này.
6. Chạy block transaction ở mục 5 bằng client có khả năng kiểm tra affected-row count.
7. `COMMIT` chỉ khi đúng một row đổi và duy nhất cột `script` đổi. Nếu không, `ROLLBACK`.
8. Chạy Flyway `validate` và `info` bằng cùng artifact/source migration dự kiến deploy.
9. Restart backend hai lần, kiểm tra health và xác nhận log không chạy migration.
10. So sánh schema/business checksums hoặc metadata audit trước/sau.
11. Lưu change ticket, operator, thời điểm, backup reference và kết quả validation trong
    hệ thống audit có kiểm soát; không ghi secret.

Không dùng bridge profile để che validation, không dùng `flyway repair`, không tạo V35 và
không đổi tên/sửa source V1-V34.

## 8. Rollback metadata

Nếu cần quay lại metadata cũ trước khi application được mở lại, restore ledger backup hoặc
chạy transaction guarded ngược dưới đây. Cũng chỉ commit khi đúng một row được cập nhật:

```sql
START TRANSACTION;

UPDATE flyway_schema_history
SET script = 'V12__expand_event_geo_type_enum.sql'
WHERE version = '12'
  AND script = 'V12__nullable_event_chronology.sql'
  AND description = 'nullable event chronology'
  AND checksum = 471765287
  AND success = 1;

SELECT ROW_COUNT() AS updated_rows;

-- COMMIT chỉ khi updated_rows = 1; ngược lại ROLLBACK.
```

Rollback này chỉ phục hồi metadata filename; nó không rollback chronology hoặc geo enum
DDL. Mọi rollback schema phải là một thay đổi forward-only riêng và nằm ngoài procedure
này.

## 9. Cảnh báo còn lại và gate Phase 7

- Flyway 11.14.1 cảnh báo MySQL 8.4 mới hơn phiên bản MySQL 8.1 mà bản Flyway này đã xác
  minh chính thức. Điều này không làm fail validate, nhưng cần giữ trong hồ sơ rủi ro.
- Flyway CLI cảnh báo location mặc định `/flyway/sql` có thể bị deprecate trong tương lai.
- Maven còn warning API deprecated và Mockito dynamic agent; không có test failure.
- Configured TiDB chưa được remediation hoặc restart trong task này.
- Phase 7 **không được tiếp tục** cho tới khi remediation configured TiDB được phê duyệt,
  áp dụng bởi người có thẩm quyền và toàn bộ gate validate/info/restart/schema comparison
  được xác nhận lại trên môi trường đó.

## 10. Applied Remediation - Configured TiDB

Remediation được áp dụng ngày `2026-07-19` sau khi người dùng phê duyệt rõ việc dùng
credential hiện tại và chấp nhận rủi ro rotation. Credential, username và JDBC URL không
được in hoặc ghi vào evidence.

### 10.1 Backup reference

- Evidence directory: `%TEMP%/configured-tidb-v12-remediation-20260719-101509/`.
- Full ledger backup: `flyway-schema-history-before.csv`.
- Focused backup: `flyway-v12-v34-before.csv`.
- Full ledger backup SHA-256:
  `ae21122444fbc8078e9da3278fed04014a1b85bec0cd15e780e92f80604e32f6`.
- Backup chứa toàn bộ field Flyway, gồm `installed_by`, nhưng field này không được in ra
  báo cáo hoặc command output.

### 10.2 Row trước và sau

| Field | Trước | Sau |
|---|---|---|
| `installed_rank` | `12` | `12` |
| `version` | `12` | `12` |
| `description` | `nullable event chronology` | Không đổi |
| `script` | `V12__expand_event_geo_type_enum.sql` | `V12__nullable_event_chronology.sql` |
| `checksum` | `471765287` | Không đổi |
| `installed_on` | `2026-06-29 17:15:53` | Không đổi |
| `execution_time` | `311` | Không đổi |
| `success` | `true` | Không đổi |

Guarded transaction cập nhật đúng `1` row và commit. Transaction idempotency sau commit
cập nhật `0` row rồi rollback. V34 giữ nguyên filename, checksum `65777660`, success
`true` và `installed_rank = 35`.

### 10.3 Validation thực tế

| Check | Kết quả |
|---|---|
| Flyway `validate` | PASS |
| Flyway `info` | V34 current; 34 applied; 0 pending; 0 failed |
| Backend restart 1 | Health HTTP 200/UP; graceful shutdown HTTP 200 |
| Backend restart 2 | Health HTTP 200/UP; graceful shutdown HTTP 200 |
| Sensitive log scan | 0 match cho JDBC URL, datasource key, username hoặc password |
| `./mvnw clean test` | PASS; 31 tests, 0 failure/error/skipped |
| `./mvnw -DskipTests package` | PASS |

Không migration nào chạy lại. Full ledger backup trước và sau giống hệt sau khi normalize
duy nhất filename V12.

### 10.4 Schema và business-data audit

- Schema fingerprint trước/sau:
  `050bc4f2454ec56c07f44fc017725f90419ed2f40e96b07511286f2e13a26c8e`.
- Business table-count fingerprint trước/sau:
  `1f5082fcb3081060426297ac595ea6d96abb35c66f71519ce623ad0aec5ecf69`.
- Active dataset pointer: `1`.
- Exams/sections/questions/topics/mappings: `38 / 76 / 1,064 / 32 / 1,092`.
- Orphan sections/questions: `0 / 0`.
- Dataset-section mismatch: `0`.

Kết quả xác nhận không có DDL hoặc business-data DML trong remediation.

### 10.5 Gate Phase 7: PASS

Configured ledger có `34` row nhưng `max(installed_rank) = 35`, vì historical installed
rank `21` không tồn tại. Đây là trạng thái baseline trước remediation và không thay đổi sau
remediation. Quy trình chỉ được phép sửa V12 `script`, nên không được renumber hoặc sửa
rank để ép giá trị về `34`.

Ngày `2026-07-19`, owner xác nhận baseline `34 rows / max installed_rank 35` là hợp lệ.
Khoảng trống historical rank `21` không phải thay đổi do remediation và không được sửa để
ép rank liên tục. Với xác nhận này, cùng kết quả validate/info, hai lần restart, schema
comparison và test/package đều PASS, migration integrity gate cho Phase 7 được xem là
đã đạt. Không dùng `flyway repair` và không rollback V12 chỉ vì rank gap đã tồn tại từ trước.
