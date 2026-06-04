export const defaultEventTemplate = {
  id: '',
  slug: '',
  entityType: 'event',
  eventLevel: 'atomic',
  titles: {
    primary: '',
    short: '',
    alternatives: [] as string[],
  },
  classification: {
    eventType: '',
    eventSubtype: '',
    tags: [] as string[],
  },
  coverage: {
    grades: [] as number[],
  },
  chronology: {
    start: {
      year: null as number | null,
      month: null as number | null,
      day: null as number | null,
    },
    end: {
      year: null as number | null,
      month: null as number | null,
      day: null as number | null,
    },
    datePrecision: '',
    displayDate: '',
    isApproximate: false,
  },
  mapData: {
    displayGeometry: {
      geoType: '',
      marker: {
        lat: null as number | null,
        lng: null as number | null,
        label: '',
      },
      markers: [] as Array<{ lat: number | null; lng: number | null; label: string }>,
      provinceNames: [] as string[],
      gadmRefs: [] as string[],
      historicalLocations: [] as string[],
    },
    focusGeometry: {
      mode: 'auto',
      center: {
        lat: null as number | null,
        lng: null as number | null,
      },
      zoom: null as number | null,
      provinceNames: [] as string[],
      gadmRefs: [] as string[],
    },
  },
  summary: {
    homepageTitle: '',
    homepageSummary: '',
    cardSummary: '',
  },
  textbookContent: {
    canonicalSummary: '',
    detailedNarrative: '',
    significance: '',
    keyFacts: [] as string[],
    textbookRefs: [
      {
        grade: null as number | null,
        book: '',
        theme: '',
        lesson: '',
        pageStart: null as number | null,
        pageEnd: null as number | null,
        excerpt: '',
      },
    ],
  },
  externalContent: {
    wikipedia: {
      title: '',
      url: '',
      summary: '',
      content: '',
    },
    wikidata: {
      id: '',
      url: '',
    },
    otherSources: [] as string[],
  },
  media: {
    thumbnail: '',
    items: [
      {
        id: '',
        type: 'image',
        category: '',
        role: '',
        url: '',
        caption: '',
        alt: '',
        source: '',
        license: '',
        credit: '',
        isPrimary: false,
      },
    ],
  },
  hierarchy: {
    rootId: '',
    parentId: null as string | null,
    childIds: [] as string[],
    level: 0,
    orderInParent: 0,
  },
  associations: {
    relatedEventIds: [] as string[],
    relatedFigureIds: [] as string[],
    predecessorEventIds: [] as string[],
    successorEventIds: [] as string[],
  },
  display: {
    showOnHomepage: true,
    showOnTimeline: true,
    featured: false,
  },
  sourcePolicy: {
    canonicalSource: 'textbook',
    supplementalSources: ['wikipedia', 'wikidata'] as string[],
  },
}

export type EventTemplate = typeof defaultEventTemplate
