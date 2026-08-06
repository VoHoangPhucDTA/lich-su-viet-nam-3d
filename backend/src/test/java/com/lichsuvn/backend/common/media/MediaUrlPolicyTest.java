package com.lichsuvn.backend.common.media;

import com.lichsuvn.backend.common.exception.ApiException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MediaUrlPolicyTest {
    private final MediaUrlPolicy policy = new MediaUrlPolicy();

    @Test
    void acceptsPublicHttpUrlsWithoutRewritingThem() {
        String value = "https://cdn.example.org/A%20B.jpg?version=1";
        assertThat(policy.requireAdminUrl(value)).isEqualTo(value);
    }

    @Test
    void rejectsInternalAndDangerousAdminUrls() {
        for (String value : new String[]{
                "local:package/image.jpg", "file:///tmp/a.jpg", "javascript:alert(1)",
                "data:image/png;base64,x", "blob:https://example.org/id",
                "http://localhost/a", "http://assets.local/a", "http://127.0.0.1/a",
                "http://10.0.0.2/a", "http://169.254.1.2/a", "http://192.168.1.2/a",
                "http://172.16.0.1/a", "http://172.31.255.255/a",
                "http://[::1]/a", "http://[fc00::1]/a", "http://[fe80::1]/a",
                "https://user:password@example.org/a", "https:///missing-host",
                "https://example.org/%0aheader", "https://example.org/a\nb", "/relative/a.jpg"
        }) {
            assertThatThrownBy(() -> policy.requireAdminUrl(value))
                    .as(value).isInstanceOf(ApiException.class);
        }
    }

    @Test
    void redactsUnsafeLegacyValuesButAllowsExistingRelativeDisplayPaths() {
        assertThat(policy.redactDisplayUrl("local:package/image.jpg")).isNull();
        assertThat(policy.redactDisplayUrl("javascript:alert(1)")).isNull();
        assertThat(policy.redactDisplayUrl("/assets/image.jpg")).isEqualTo("/assets/image.jpg");
        assertThat(policy.redactMetadata("local:importer")).isNull();
    }
}
