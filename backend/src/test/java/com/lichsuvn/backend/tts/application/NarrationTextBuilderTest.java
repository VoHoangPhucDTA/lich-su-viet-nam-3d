package com.lichsuvn.backend.tts.application;

import com.lichsuvn.backend.tts.infrastructure.TtsEventNarrationRepository.EventNarrationData;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class NarrationTextBuilderTest {
    private final NarrationTextBuilder builder = new NarrationTextBuilder();

    @Test
    void buildsNarrationFromTheVisibleDetailSectionsOnly() {
        EventNarrationData event = new EventNarrationData(
                "tuyen-ngon-doc-lap-1945",
                "Tuyên ngôn Độc lập",
                "2/9/1945",
                "2/9/1945",
                List.of("Hà Nội", "Ba Đình"),
                "Sự kiện khai sinh nước Việt Nam Dân chủ Cộng hòa",
                "Đây là bản tuyên ngôn lịch sử.",
                "Chủ tịch Hồ Chí Minh đọc Tuyên ngôn Độc lập.",
                "Sự kiện có ý nghĩa đặc biệt với dân tộc Việt Nam."
        );

        assertEquals("""
                Đây là bản tuyên ngôn lịch sử.

                Chủ tịch Hồ Chí Minh đọc Tuyên ngôn Độc lập.

                Sự kiện có ý nghĩa đặc biệt với dân tộc Việt Nam.""", builder.build(event));
    }

    @Test
    void omitsMissingCanonicalSummaryAndUsesFallbackSummary() {
        EventNarrationData event = new EventNarrationData(
                "bach-dang",
                "Chiến thắng Bạch Đằng",
                "",
                "938",
                List.of(),
                "Tóm tắt thẻ",
                null,
                "Quân Nam Hán thất bại trên sông Bạch Đằng",
                null
        );

        assertEquals("""
                Tóm tắt thẻ.

                Quân Nam Hán thất bại trên sông Bạch Đằng.""", builder.build(event));
    }

    @Test
    void handlesNullBlankWhitespaceLineBreaksAndHtmlExactly() {
        EventNarrationData event = new EventNarrationData(
                "html-event",
                "  Sự kiện   có HTML  ",
                null,
                " Tháng 3 \n năm 1954 ",
                List.of("  Điện Biên  ", " "),
                "  <b>Tóm tắt</b>\n nhiều    khoảng trắng ",
                "   ",
                null,
                " Ý nghĩa \n\n lịch sử "
        );

        assertEquals("""
                <b>Tóm tắt</b> nhiều khoảng trắng.

                Ý nghĩa lịch sử.""", builder.build(event));
    }

    @Test
    void normalizeForSynthesisCollapsesWhitespace() {
        assertEquals("Một hai ba", builder.normalizeForSynthesis("  Một\n\n hai\t ba  "));
    }
}
