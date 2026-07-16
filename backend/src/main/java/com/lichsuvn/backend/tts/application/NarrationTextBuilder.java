package com.lichsuvn.backend.tts.application;

import com.lichsuvn.backend.tts.infrastructure.TtsEventNarrationRepository.EventNarrationData;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

@Service
public class NarrationTextBuilder {
    private static final Pattern LEADING_NATURAL_DATE =
            Pattern.compile("^(ngay|thang|nam|tu|vao)\\b", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern YEAR_RANGE =
            Pattern.compile("^(\\d{4})\\s*[–\\-—]\\s*(\\d{4})$");
    private static final Pattern SINGLE_YEAR = Pattern.compile("^(\\d{1,4})$");
    private static final Pattern SLASH_DATE =
            Pattern.compile("^(\\d{1,2})/(\\d{1,2})/(\\d{4})$");

    public String build(EventNarrationData event) {
        List<String> parts = new ArrayList<>();
        String title = clean(event.title());
        String shortTitle = clean(event.shortTitle());
        String date = clean(event.displayDate());
        String location = location(event.provinceNames());

        if (!title.isBlank()) {
            StringBuilder opening = new StringBuilder(title);
            if (!date.isBlank()) {
                opening.append(". Diễn ra ").append(preprocessDate(date));
            }
            if (!location.isBlank()) {
                opening.append(", tại ").append(location);
            }
            opening.append('.');
            parts.add(opening.toString());

            if (!shortTitle.isBlank() && !shortTitle.equals(title)) {
                parts.add("Sự kiện này còn được gọi là: " + shortTitle + ".");
            }
        }

        String summary = firstNonBlank(event.cardSummary());
        if (!summary.isBlank()) {
            parts.add(summary);
        }

        String canonicalSummary = clean(event.canonicalSummary());
        String detailedNarrative = clean(event.detailedNarrative());
        if (!detailedNarrative.isBlank()) {
            if (!canonicalSummary.isBlank()) {
                parts.add(canonicalSummary);
            }
            parts.add(detailedNarrative);
        } else if (!canonicalSummary.isBlank()) {
            parts.add(canonicalSummary);
        }

        String significance = clean(event.significance());
        if (!significance.isBlank()) {
            parts.add(significance);
        }

        if (!title.isBlank()) {
            parts.add("Trên đây là nội dung tường thuật về sự kiện " + title + ".");
        }

        return String.join("\n\n", parts.stream()
                .map(this::preprocessText)
                .filter(s -> !s.isBlank())
                .toList());
    }

    public String normalizeForSynthesis(String text) {
        return clean(text);
    }

    private String preprocessText(String text) {
        String result = clean(text);
        if (result.isBlank()) {
            return "";
        }
        if (!result.endsWith(".") && !result.endsWith("!") && !result.endsWith("?")) {
            result += ".";
        }
        return result;
    }

    private String preprocessDate(String displayDate) {
        String normalized = clean(displayDate);
        String ascii = stripVietnameseForDatePrefix(normalized).toLowerCase();
        if (LEADING_NATURAL_DATE.matcher(ascii).find()) {
            return normalized;
        }

        var range = YEAR_RANGE.matcher(normalized);
        if (range.matches()) {
            return "từ năm " + range.group(1) + " đến năm " + range.group(2);
        }

        var year = SINGLE_YEAR.matcher(normalized);
        if (year.matches()) {
            return "năm " + year.group(1);
        }

        var date = SLASH_DATE.matcher(normalized);
        if (date.matches()) {
            return "ngày " + date.group(1) + " tháng " + date.group(2) + " năm " + date.group(3);
        }

        return normalized;
    }

    private String location(List<String> provinceNames) {
        if (provinceNames == null || provinceNames.isEmpty()) {
            return "";
        }
        return provinceNames.stream()
                .map(this::clean)
                .filter(s -> !s.isBlank())
                .reduce((a, b) -> a + ", " + b)
                .orElse("");
    }

    private String firstNonBlank(String value) {
        String cleaned = clean(value);
        return cleaned.isBlank() ? "" : cleaned;
    }

    private String clean(String value) {
        if (value == null) {
            return "";
        }
        return value.replaceAll("\\s+", " ").trim();
    }

    private String stripVietnameseForDatePrefix(String value) {
        return value
                .replace('à', 'a').replace('á', 'a').replace('ả', 'a').replace('ã', 'a').replace('ạ', 'a')
                .replace('ă', 'a').replace('ằ', 'a').replace('ắ', 'a').replace('ẳ', 'a').replace('ẵ', 'a').replace('ặ', 'a')
                .replace('â', 'a').replace('ầ', 'a').replace('ấ', 'a').replace('ẩ', 'a').replace('ẫ', 'a').replace('ậ', 'a')
                .replace('è', 'e').replace('é', 'e').replace('ẻ', 'e').replace('ẽ', 'e').replace('ẹ', 'e')
                .replace('ê', 'e').replace('ề', 'e').replace('ế', 'e').replace('ể', 'e').replace('ễ', 'e').replace('ệ', 'e')
                .replace('ì', 'i').replace('í', 'i').replace('ỉ', 'i').replace('ĩ', 'i').replace('ị', 'i')
                .replace('ò', 'o').replace('ó', 'o').replace('ỏ', 'o').replace('õ', 'o').replace('ọ', 'o')
                .replace('ô', 'o').replace('ồ', 'o').replace('ố', 'o').replace('ổ', 'o').replace('ỗ', 'o').replace('ộ', 'o')
                .replace('ơ', 'o').replace('ờ', 'o').replace('ớ', 'o').replace('ở', 'o').replace('ỡ', 'o').replace('ợ', 'o')
                .replace('ù', 'u').replace('ú', 'u').replace('ủ', 'u').replace('ũ', 'u').replace('ụ', 'u')
                .replace('ư', 'u').replace('ừ', 'u').replace('ứ', 'u').replace('ử', 'u').replace('ữ', 'u').replace('ự', 'u')
                .replace('ỳ', 'y').replace('ý', 'y').replace('ỷ', 'y').replace('ỹ', 'y').replace('ỵ', 'y')
                .replace('đ', 'd');
    }
}
