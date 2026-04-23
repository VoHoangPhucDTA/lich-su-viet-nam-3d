import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { MockEventDetail } from '../data/mockEventDetails';
import { getEventDetailBySlug } from '../services/eventDetailService';

import EventHero from '../components/event-detail/EventHero';
import EventTTSPlayer from '../components/event-detail/EventTTSPlayer';
import EventTextbookContent from '../components/event-detail/EventTextbookContent';
import EventKeyFacts from '../components/event-detail/EventKeyFacts';
import EventLocationCard from '../components/event-detail/EventLocationCard';
import EventChildrenList from '../components/event-detail/EventChildrenList';
import EventMediaGallery from '../components/event-detail/EventMediaGallery';
import EventSources from '../components/event-detail/EventSources';
import EventDetailSidebar from '../components/event-detail/EventDetailSidebar';

export default function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [eventData, setEventData] = useState<MockEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      if (!slug) return;
      console.debug('[EventDetailPage] Searching for slug:', slug);
      try {
        setLoading(true);
        const data = await getEventDetailBySlug(slug);
        console.debug('[EventDetailPage] Lookup result:', data);
        if (data) {
          setEventData(data);
          setError(false);
          window.scrollTo(0, 0);
        } else {
          setError(true);
        }
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    loadEvent();
  }, [slug]);

  const navLinks = useMemo(() => {
    if (!eventData) return [];
    
    const links = [{ id: 'tong-quan', label: 'Tổng quan' }];
    
    if (eventData.textbookContent.detailedNarrative) {
      links.push({ id: 'noi-dung-sgk', label: 'Nội dung SGK' });
    }
    if (eventData.textbookContent.significance) {
      links.push({ id: 'y-nghia', label: 'Ý nghĩa' });
    }
    if (eventData.textbookContent.keyFacts?.length) {
      links.push({ id: 'du-kien-chinh', label: 'Dữ kiện chính' });
    }
    
    // Map Location exists and is not world history
    const isVN = !eventData.classification.tags?.includes('lịch sử thế giới');
    const geoType = eventData.mapData?.displayGeometry?.geoType;
    if (isVN && geoType && geoType !== 'no_location') {
      links.push({ id: 'dia-diem', label: 'Địa điểm' });
    }
    
    if (eventData.hierarchy?.childIds?.length) {
      links.push({ id: 'su-kien-con', label: 'Sự kiện con' });
    }
    
    if (eventData.media?.thumbnail || eventData.media?.items?.length) {
      links.push({ id: 'media', label: 'Media' });
    }
    
    if (eventData.textbookContent.textbookRefs?.length) {
      links.push({ id: 'nguon-sgk', label: 'Nguồn SGK' });
    }
    
    if (eventData.externalContent) {
      links.push({ id: 'nguon-mo-rong', label: 'Nguồn mở rộng' });
    }

    return links;
  }, [eventData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-app text-primary">
        <div className="w-8 h-8 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
        <div className="text-lg font-medium text-muted">Đang tải dữ liệu sự kiện...</div>
      </div>
    );
  }

  if (error || !eventData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-app text-primary gap-4 p-6 text-center">
        <span className="text-5xl mb-2">📜</span>
        <h2 className="text-2xl font-bold">Không tìm thấy thông tin sự kiện</h2>
        <p className="text-muted mb-2 max-w-lg">
          Sự kiện <strong className="text-primary">"{slug}"</strong> bạn đang tìm kiếm chưa được cập nhật dữ liệu chi tiết trong hệ thống.
        </p>
        
        <div className="bg-card border border-default p-4 rounded-xl max-w-lg w-full text-left mt-2 mb-4 shadow-theme">
          <p className="text-sm font-semibold text-muted mb-3 uppercase tracking-wider">Các sự kiện tiêu biểu có sẵn:</p>
          <div className="flex flex-col gap-2">
            <button key="db" onClick={() => { navigate('/events/chien-dich-dien-bien-phu-1954'); window.location.reload(); }} className="accent-primary hover:text-primary text-left text-sm py-1">
              • Chiến dịch Điện Biên Phủ 1954
            </button>
            <button key="kc" onClick={() => { navigate('/events/khang-chien-chong-phap-1945-1954'); window.location.reload(); }} className="accent-primary hover:text-primary text-left text-sm py-1">
              • Kháng chiến chống Pháp 1945–1954
            </button>
            <button key="it" onClick={() => { navigate('/events/hoi-nghi-ianta-1945'); window.location.reload(); }} className="accent-primary hover:text-primary text-left text-sm py-1">
              • Hội nghị I-an-ta 1945
            </button>
          </div>
        </div>

        <button
          onClick={() => navigate('/')}
          className="px-6 py-2.5 rounded-lg transition font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          ← Quay lại bản đồ
        </button>
      </div>
    );
  }

  const isVietnamEvent = !eventData.classification.tags?.includes('lịch sử thế giới');
  const hasLocation = eventData.mapData?.displayGeometry !== undefined && eventData.mapData.displayGeometry.geoType !== 'no_location';
  const showMapAction = isVietnamEvent && hasLocation;

  return (
    <div className="min-h-screen w-full bg-app text-primary selection:bg-[var(--accent-soft)] font-sans">
      
      {/* Top Navbar */}
      <div className="sticky top-0 z-50 glass-map border-b border-default px-6 max-w-7xl mx-auto py-3 w-full flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm font-medium text-secondary">
          <button 
            onClick={() => navigate('/')}
            className="hover:text-[var(--accent)] transition flex items-center gap-2"
          >
            ← Quay lại
          </button>
          <span className="text-muted">/</span>
          <span className="hidden sm:inline text-muted">Bản đồ lịch sử</span>
          <span className="hidden sm:inline text-muted">/</span>
          <span className="accent-primary truncate max-w-[200px] sm:max-w-[400px]">
            {eventData.titles.primary}
          </span>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row items-start gap-12 relative pb-32">
        
        {/* Left Column - Main Details */}
        <div className="flex-1 flex flex-col gap-10 min-w-0">
          
          <EventHero event={eventData} />
          
          <EventTTSPlayer event={eventData} />
          
          <EventTextbookContent event={eventData} />
          
          <EventKeyFacts keyFacts={eventData.textbookContent.keyFacts} />
          
          <EventLocationCard event={eventData} />
          
          <EventChildrenList childIds={eventData.hierarchy?.childIds} />
          
          <EventMediaGallery media={eventData.media} />
          
          <EventSources 
            textbookRefs={eventData.textbookContent.textbookRefs} 
            externalContent={eventData.externalContent} 
          />

        </div>

        {/* Right Column - Navigation Sidebar (Desktop only) */}
        <EventDetailSidebar navLinks={navLinks} showMapAction={showMapAction} />
        
      </div>
    </div>
  );
}
