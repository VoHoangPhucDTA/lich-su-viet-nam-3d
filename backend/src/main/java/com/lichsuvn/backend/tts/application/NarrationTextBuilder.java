package com.lichsuvn.backend.tts.application;

import com.lichsuvn.backend.tts.infrastructure.TtsEventNarrationRepository.EventNarrationData;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class NarrationTextBuilder {
    public String build(EventNarrationData event) {
        List<String> parts = new ArrayList<>();
        String canonicalSummary = firstNonBlank(event.canonicalSummary(), event.cardSummary());
        String detailedNarrative = clean(event.detailedNarrative());
        String significance = clean(event.significance());

        if (!canonicalSummary.isBlank()) {
            parts.add(canonicalSummary);
        }
        if (!detailedNarrative.isBlank() && !detailedNarrative.equals(canonicalSummary)) {
            parts.add(detailedNarrative);
        }
        if (!significance.isBlank()
                && !significance.equals(canonicalSummary)
                && !significance.equals(detailedNarrative)) {
            parts.add(significance);
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

    private String firstNonBlank(String... values) {
        for (String value : values) {
            String cleaned = clean(value);
            if (!cleaned.isBlank()) {
                return cleaned;
            }
        }
        return "";
    }

    private String clean(String value) {
        if (value == null) {
            return "";
        }
        return value.replaceAll("\\s+", " ").trim();
    }

}
