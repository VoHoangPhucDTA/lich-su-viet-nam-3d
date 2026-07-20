# Quan sát hiệu năng

## Build

`npx vite build` được chạy trực tiếp, không chạy npm `prebuild`.

| Chỉ số | Giá trị | Mức chứng cứ |
|---|---:|---|
| Build result | PASS | MEASURED |
| Build time | 27.66 giây | MEASURED |
| Modules transformed | 3,553 | MEASURED |
| CSS | 84.88 kB; gzip 16.30 kB | MEASURED |
| JavaScript | 5,715.42 kB; gzip 1,445.44 kB | MEASURED |
| Source/generated status changed | Không | MEASURED |

Vite cảnh báo chunk JavaScript lớn hơn 500 kB. Đây là limitation hiện hữu; Phase 8–9 không thực hiện refactor/code-splitting lớn.

## Runtime

FPS, time-to-terrain, camera duration, network timing, GPU memory và WebGL resource growth là `UNVERIFIED` do thiếu token/backend local. Không suy diễn performance runtime từ build output.
