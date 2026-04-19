"use client";
import { useEffect, useRef, useState } from "react";
import { Badge, Card, Stack, Text } from "@dontopedia/ui";
import css from "./research-stream.module.css";

interface LogEvent {
  t: number;
  kind: "log" | "step" | "extracted" | "asserted" | "error" | "done";
  msg: string;
  data?: unknown;
}

export function ResearchStream({ sessionId }: { sessionId: string }) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">(
    "connecting",
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = `/api/research/${encodeURIComponent(sessionId)}/stream`;
    const es = new EventSource(url);

    es.onopen = () => setStatus("open");
    es.onerror = () => {
      setStatus("error");
      es.close();
    };
    es.addEventListener("event", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as LogEvent;
        setEvents((prev) => [...prev, ev]);
        if (ev.kind === "done") {
          setStatus("closed");
          es.close();
        }
      } catch {
        /* noop */
      }
    });

    return () => es.close();
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [events]);

  return (
    <Card variant="outlined" className={css.wrap}>
      <Stack direction="row" gap={3} align="center" justify="between" className={css.head}>
        <Text variant="label">agent log</Text>
        <Badge tone={status === "open" ? "derived" : status === "error" ? "error" : "neutral"}>
          {status}
        </Badge>
      </Stack>
      <div ref={scrollRef} className={css.log}>
        {events.length === 0 ? (
          <Text muted className={css.empty}>
            waiting for the first event…
          </Text>
        ) : (
          events.map((e, i) => (
            <div key={i} className={css.line} data-kind={e.kind}>
              <span className={css.time}>
                {new Date(e.t).toLocaleTimeString(undefined, { hour12: false })}
              </span>
              <span className={css.kind}>{e.kind}</span>
              <span className={css.msg}>{e.msg}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
