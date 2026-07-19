ALTER TABLE historical_events
    MODIFY geo_type ENUM(
        'single_point',
        'multi_region',
        'nationwide',
        'no_location',
        'point',
        'multi_point',
        'multi_polygon',
        'mixed'
    ) NOT NULL;
