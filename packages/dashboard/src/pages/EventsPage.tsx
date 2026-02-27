import { useEffect, useRef } from 'react';
import { useEventStore } from '../stores/event-store';
import { EventItem } from '../components/events/EventItem';
import { EventFilter } from '../components/events/EventFilter';

export function EventsPage() {
  const { events, loading, hasMore, fetchEvents, loadMore } = useEventStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEvents(true);
  }, [fetchEvents]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100 && !loading && hasMore) {
      loadMore();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Events</h1>
          <p className="text-gray-400 text-sm mt-1">Real-time event log</p>
        </div>
      </div>

      <div className="mb-6 p-4 bg-gray-900 border border-gray-800 rounded-xl">
        <EventFilter />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-gray-900 border border-gray-800 rounded-xl"
      >
        {events.length === 0 && !loading ? (
          <div className="text-center py-16 text-gray-500">
            <svg
              className="w-16 h-16 mx-auto mb-4 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-lg">No events found</p>
            <p className="text-sm mt-1">Events will appear here in real-time</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-800">
              {events.map((event, index) => (
                <EventItem key={`${event.id}-${index}`} event={event} />
              ))}
            </div>

            {loading && (
              <div className="p-4 text-center">
                <div className="inline-flex items-center gap-2 text-gray-400">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Loading...
                </div>
              </div>
            )}

            {!loading && hasMore && (
              <div className="p-4 text-center">
                <button
                  onClick={loadMore}
                  className="px-4 py-2 text-blue-400 hover:text-blue-300 text-sm font-medium"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
