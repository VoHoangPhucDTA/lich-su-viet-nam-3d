package com.lichsuvn.backend.tts.infrastructure;

import com.lichsuvn.backend.tts.application.TtsCacheKeyBuilder;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TtsAudioAssetRepositoryTest {
    @Test
    void duplicateKeyWithoutExistingCacheRecordPreservesOriginalException() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        DuplicateKeyException duplicate = new DuplicateKeyException("duplicate on a constraint");
        when(jdbc.update(anyString(), any(MapSqlParameterSource.class))).thenThrow(duplicate);
        when(jdbc.query(anyString(), any(MapSqlParameterSource.class), any(RowMapper.class))).thenReturn(List.of());

        TtsAudioAssetRepository repository = new TtsAudioAssetRepository(jdbc);

        IllegalStateException error = assertThrows(
                IllegalStateException.class,
                () -> repository.claimPending(command())
        );
        assertSame(duplicate, error.getCause());
    }

    private TtsAudioAssetRepository.NewAssetCommand command() {
        return new TtsAudioAssetRepository.NewAssetCommand(
                "a".repeat(64),
                "event-1",
                "b".repeat(64),
                TtsCacheKeyBuilder.PROVIDER,
                "hcm-diemmy",
                new BigDecimal("1.00"),
                TtsCacheKeyBuilder.AUDIO_FORMAT,
                TtsCacheKeyBuilder.RETURN_OPTION,
                TtsCacheKeyBuilder.WITHOUT_FILTER,
                TtsCacheKeyBuilder.TEXT_PROCESSING_VERSION
        );
    }
}
