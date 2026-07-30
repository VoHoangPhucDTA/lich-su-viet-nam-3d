package com.lichsuvn.backend.event.application;

import com.lichsuvn.backend.event.api.dto.HomepageEventSummaryDto;
import com.lichsuvn.backend.event.api.dto.HomepageEventsResponse;
import com.lichsuvn.backend.event.infrastructure.EventReadRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EventReadServiceHomepageTest {
    @Mock
    private EventReadRepository eventReadRepository;

    private EventReadService service;

    @BeforeEach
    void setUp() {
        service = new EventReadService(eventReadRepository);
    }

    @Test
    void keepsTheBackendOwnedCuratedCatalogAndReordersRepositoryRows() {
        assertEquals(List.of(
                "chien-thang-bach-dang-938",
                "ly-thai-to-doi-do-thang-long",
                "khang-chien-chong-quan-thanh-1789",
                "ho-chi-minh-cong-bo-tuyen-ngon-doc-lap",
                "chien-dich-dien-bien-phu-1954",
                "chien-dich-giai-phong-sai-gon-gia-dinh-chien-dich-ho-chi-minh"
        ), EventReadService.HOMEPAGE_EVENT_SLUGS);

        when(eventReadRepository.findHomepageSummaries(EventReadService.HOMEPAGE_EVENT_SLUGS))
                .thenReturn(List.of(summary(5), summary(2), summary(0), summary(4), summary(1), summary(3)));

        HomepageEventsResponse response = service.findHomepageEvents();

        assertEquals(EventReadService.HOMEPAGE_EVENT_SLUGS,
                response.events().stream().map(HomepageEventSummaryDto::slug).toList());
        verify(eventReadRepository).findHomepageSummaries(EventReadService.HOMEPAGE_EVENT_SLUGS);
        verify(eventReadRepository, never()).findDetailByIdOrSlug(anyString());
    }

    @Test
    void omitsMissingOrUnpublishedRowsWithoutAddingFallbackPolicyToTheBackend() {
        when(eventReadRepository.findHomepageSummaries(EventReadService.HOMEPAGE_EVENT_SLUGS))
                .thenReturn(List.of(summary(0), summary(1), summary(3), summary(4), summary(5)));

        HomepageEventsResponse response = service.findHomepageEvents();

        assertEquals(5, response.events().size());
        assertEquals(List.of(
                EventReadService.HOMEPAGE_EVENT_SLUGS.get(0),
                EventReadService.HOMEPAGE_EVENT_SLUGS.get(1),
                EventReadService.HOMEPAGE_EVENT_SLUGS.get(3),
                EventReadService.HOMEPAGE_EVENT_SLUGS.get(4),
                EventReadService.HOMEPAGE_EVENT_SLUGS.get(5)
        ), response.events().stream().map(HomepageEventSummaryDto::slug).toList());
    }

    @Test
    void suppressesDuplicateAndInvalidRowsAndReturnsAnImmutableResponse() {
        HomepageEventSummaryDto first = summary(0);
        HomepageEventSummaryDto duplicate = new HomepageEventSummaryDto(
                "duplicate-id", first.slug(), "Duplicate", 938, "military", List.of(), "duplicate"
        );
        HomepageEventSummaryDto invalid = new HomepageEventSummaryDto(
                "invalid", "not-curated", "Invalid", 1, "unsupported", List.of(), "invalid"
        );
        when(eventReadRepository.findHomepageSummaries(EventReadService.HOMEPAGE_EVENT_SLUGS))
                .thenReturn(List.of(duplicate, invalid, first, summary(1)));

        HomepageEventsResponse response = service.findHomepageEvents();

        assertEquals(List.of(first.slug(), summary(1).slug()),
                response.events().stream().map(HomepageEventSummaryDto::slug).toList());
        assertEquals(2, response.events().stream().map(HomepageEventSummaryDto::id).collect(java.util.stream.Collectors.toSet()).size());
        assertThrows(UnsupportedOperationException.class, () -> response.events().add(summary(2)));
    }

    @Test
    void returnsAnEmptyImmutableResponseWhenTheRepositoryHasNoEligibleRows() {
        when(eventReadRepository.findHomepageSummaries(EventReadService.HOMEPAGE_EVENT_SLUGS)).thenReturn(List.of());

        HomepageEventsResponse response = service.findHomepageEvents();

        assertEquals(List.of(), response.events());
        assertThrows(UnsupportedOperationException.class, () -> response.events().add(summary(0)));
    }

    private HomepageEventSummaryDto summary(int position) {
        String slug = EventReadService.HOMEPAGE_EVENT_SLUGS.get(position);
        return new HomepageEventSummaryDto(
                slug,
                slug,
                "Title " + position,
                position == 2 ? null : 900 + position,
                "military",
                List.of("Province " + position),
                "Summary " + position
        );
    }
}
