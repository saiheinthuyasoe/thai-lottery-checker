"use client";

import { useState, useEffect, useRef } from "react";

interface BarcodeDetector {
  detect(
    image: CanvasImageSource,
  ): Promise<{ rawValue?: string; rawText?: string }[]>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetector;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

type CheckResult = {
  ticket: string;
  exact?: boolean;
  last2?: boolean;
  front3?: boolean;
  back3?: boolean;
  rank?: string;
  notes?: string;
};

export default function Home() {
  const [ticketsText, setTicketsText] = useState("123456\n654321");
  const [winningJson, setWinningJson] = useState(
    JSON.stringify(
      {
        first: ["123456"],
        side: ["835537", "835539"],
        second: ["316827", "731177", "743731", "788652", "923096"],
        third: [
          "045942",
          "183440",
          "323456",
          "389816",
          "488050",
          "575910",
          "648700",
          "727081",
          "735004",
          "756048",
        ],
        fourth: ["942297", "529147", "469811", "679528", "000395"],
        fifth: [],
        last2: ["73"],
        front3: ["701"],
        back3: ["051"],
      },
      null,
      2,
    ),
  );
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // QR scanner state
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanReqRef = useRef<number | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);

  function parseTickets(text: string) {
    return text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function parseWinning(input: string) {
    try {
      const obj = JSON.parse(input);
      const first: string[] = Array.isArray(obj.first) ? obj.first : [];
      const side: string[] = Array.isArray(obj.side) ? obj.side : [];
      const second: string[] = Array.isArray(obj.second) ? obj.second : [];
      const third: string[] = Array.isArray(obj.third) ? obj.third : [];
      const fourth: string[] = Array.isArray(obj.fourth) ? obj.fourth : [];
      const fifth: string[] = Array.isArray(obj.fifth) ? obj.fifth : [];
      const last2: string[] = Array.isArray(obj.last2) ? obj.last2 : [];
      const front3: string[] = Array.isArray(obj.front3) ? obj.front3 : [];
      const back3: string[] = Array.isArray(obj.back3) ? obj.back3 : [];
      return {
        first,
        side,
        second,
        third,
        fourth,
        fifth,
        last2,
        front3,
        back3,
      };
    } catch (e) {
      throw new Error(
        "Winning numbers must be valid JSON with `first` and `last2` arrays.",
      );
    }
  }

  function getWinningSafe() {
    try {
      return parseWinning(winningJson);
    } catch (e) {
      return {
        first: [] as string[],
        side: [] as string[],
        second: [] as string[],
        third: [] as string[],
        fourth: [] as string[],
        fifth: [] as string[],
        last2: [] as string[],
        front3: [] as string[],
        back3: [] as string[],
      };
    }
  }

  async function fetchFromApi(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    return res.json();
  }

  async function handleCheck() {
    setError(null);
    setLoading(true);
    setResults(null);
    try {
      const winning = parseWinning(winningJson);

      const tickets = parseTickets(ticketsText);
      const out: CheckResult[] = tickets.map((t) => {
        const trimmed = t.replace(/[^0-9]/g, "");
        const winningFirst = winning.first || [];
        const winningSide = winning.side || [];
        const winningSecond = winning.second || [];
        const winningThird = winning.third || [];
        const winningFourth = winning.fourth || [];
        const winningFifth = winning.fifth || [];
        const last2match = (winning.last2 || []).some(
          (w) => trimmed.slice(-2) === w.slice(-2),
        );
        const front3match = (winning.front3 || []).some(
          (w) => trimmed.slice(0, 3) === w.slice(-3),
        );
        const back3match = (winning.back3 || []).some(
          (w) => trimmed.slice(-3) === w.slice(-3),
        );

        let rank: string | undefined;
        let notes = "No match";

        if (winningFirst.includes(trimmed)) {
          rank = "1st";
          notes = "First prize";
        } else if (winningSide.includes(trimmed)) {
          rank = "Side";
          notes = "Side prize (near first)";
        } else if (winningSecond.includes(trimmed)) {
          rank = "2nd";
          notes = "Second prize";
        } else if (winningThird.includes(trimmed)) {
          rank = "3rd";
          notes = "Third prize";
        } else if (winningFourth.includes(trimmed)) {
          rank = "4th";
          notes = "Fourth prize";
        } else if (winningFifth.includes(trimmed)) {
          rank = "5th";
          notes = "Fifth prize";
        } else if (back3match) {
          notes = "Last 3 digits match";
        } else if (front3match) {
          notes = "First 3 digits match";
        } else if (last2match) {
          notes = "Last two digits match";
        }

        return {
          ticket: trimmed,
          exact: rank === "1st",
          last2: last2match,
          front3: front3match,
          back3: back3match,
          rank,
          notes,
        };
      });

      setResults(out);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function fetchRayLatest() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/ray/latest");
      if (!res.ok) throw new Error(`proxy responded ${res.status}`);
      const json = await res.json();
      if (json.status !== "success")
        throw new Error("unexpected response from rayriffy");

      const resp = json.response || {};
      const prizes: unknown[] = Array.isArray(resp.prizes) ? resp.prizes : [];
      const running: unknown[] = Array.isArray(resp.runningNumbers)
        ? resp.runningNumbers
        : [];

      const firstNums: string[] = [];
      let lastTwo: string | undefined;
      const front3: string[] = [];
      const back3: string[] = [];
      const flatNums: string[] = [];

      function extractNums(val: unknown) {
        if (val == null) return [] as string[];
        if (typeof val === "string") return [val];
        if (Array.isArray(val)) return val.map(String);
        return [] as string[];
      }

      for (const p of prizes) {
        const nums = extractNums(
          p instanceof Object
            ? (p as Record<string, unknown>).number
            : undefined,
        );
        for (const n of nums) {
          if (/^\d{6}$/.test(n)) firstNums.push(n);
          flatNums.push(n);
        }
        const id = (
          p instanceof Object && (p as Record<string, unknown>).id
            ? (p as Record<string, unknown>).id || ""
            : ""
        ).toString();
        // also capture 3-digit prize fields if present inside prize items
        if (
          id === "lotto_first_three" ||
          id.toLowerCase().includes("first_three")
        ) {
          front3.push(
            ...extractNums(
              p instanceof Object
                ? (p as Record<string, unknown>).number
                : undefined,
            ),
          );
        }
        if (
          id === "lotto_last_three" ||
          id.toLowerCase().includes("last_three")
        ) {
          back3.push(
            ...extractNums(
              p instanceof Object
                ? (p as Record<string, unknown>).number
                : undefined,
            ),
          );
        }
      }

      for (const r of running) {
        const id =
          r instanceof Object ? (r as Record<string, unknown>).id : undefined;
        const n =
          r instanceof Object
            ? (r as Record<string, unknown>).number
            : undefined;
        if (id === "runningNumberBackTwo") {
          if (Array.isArray(n) && n.length) lastTwo = String(n[0]);
          else if (typeof n === "string") lastTwo = n;
        }
        if (id === "runningNumberFrontThree") {
          if (Array.isArray(n)) front3.push(...n.map(String));
          else if (typeof n === "string") front3.push(n);
        }
        if (id === "runningNumberBackThree") {
          if (Array.isArray(n)) back3.push(...n.map(String));
          else if (typeof n === "string") back3.push(n);
        }
      }

      // Map flattened numbers by position into prize tiers as requested
      const first = flatNums.slice(0, 1);
      const side = flatNums.slice(1, 3);
      const second = flatNums.slice(3, 8);
      const third = flatNums.slice(8, 18);
      const fourth = flatNums.slice(18, 68);
      const fifth = flatNums.slice(68);

      const winning = {
        first: Array.from(new Set(first)),
        side: Array.from(new Set(side)),
        second: Array.from(new Set(second)),
        third: Array.from(new Set(third)),
        fourth: Array.from(new Set(fourth)),
        fifth: Array.from(new Set(fifth)),
        last2: lastTwo ? [lastTwo] : [],
        front3: Array.from(new Set(front3)),
        back3: Array.from(new Set(back3)),
      };
      setWinningJson(JSON.stringify(winning, null, 2));
      setTimeout(() => handleCheck(), 50);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // QR scanner functions (uses BarcodeDetector when available)
  async function startScanner() {
    setScannerError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScannerError("Camera not supported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // play may reject in some browsers if not user-initiated; ignore
        try {
          await videoRef.current.play();
        } catch {}
      }
      setScanning(true);
      scanLoop();
    } catch (e: unknown) {
      setScannerError(e instanceof Error ? e.message : String(e));
    }
  }

  function stopScanner() {
    if (scanReqRef.current) {
      cancelAnimationFrame(scanReqRef.current);
      scanReqRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {}
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  }

  async function scanLoop() {
    const video = videoRef.current;
    if (!video) return;

    // Prefer BarcodeDetector when available
    if ("BarcodeDetector" in window && window.BarcodeDetector) {
      try {
        const detector = new window.BarcodeDetector({
          formats: ["qr_code"],
        });
        const detect = async () => {
          try {
            const results = await detector.detect(video);
            if (results && results.length) {
              const val = results[0].rawValue ?? results[0].rawText ?? "";
              if (val) {
                setTicketsText((prev) => (prev ? prev + "\n" + val : val));
                stopScanner();
                return;
              }
            }
          } catch {
            // ignore transient errors
          }
          scanReqRef.current = requestAnimationFrame(detect);
        };
        detect();
        return;
      } catch (e) {
        // fallthrough to unsupported message
      }
    }

    // Try jsQR fallback: draw video frames to canvas and decode
    try {
      const mod = await import("jsqr");
      const jsQR = ((mod && (mod as Record<string, unknown>).default) ||
        mod) as (
        data: Uint8ClampedArray,
        width: number,
        height: number,
      ) => { data: string } | null;
      const canvas = canvasRef.current || document.createElement("canvas");
      canvasRef.current = canvas;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");

      const detect = async () => {
        try {
          if (!video || video.readyState < 2) {
            scanReqRef.current = requestAnimationFrame(detect);
            return;
          }
          const w = video.videoWidth || video.clientWidth;
          const h = video.videoHeight || video.clientHeight;
          if (!w || !h) {
            scanReqRef.current = requestAnimationFrame(detect);
            return;
          }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, w, h);
          if (code && code.data) {
            setTicketsText((prev) =>
              prev ? prev + "\n" + code.data : code.data,
            );
            stopScanner();
            return;
          }
        } catch (e) {
          // ignore and continue
        }
        scanReqRef.current = requestAnimationFrame(detect);
      };
      detect();
      return;
    } catch (e: unknown) {
      setScannerError(
        "No scanner available: install `jsqr` (npm i jsqr) or use a browser with BarcodeDetector",
      );
    }
  }

  // cleanup scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // automatically fetch latest results when the page loads
  useEffect(() => {
    fetchRayLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-start justify-start bg-white font-sans">
      <main className="w-full h-screen p-6 bg-white overflow-auto">
        <header className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">Thai lottery checker</h1>
        </header>

        <section className="mt-6 w-full max-w-4xl mx-auto">
          {/* First prize - big centered */}
          <div className="text-center">
            <div className="text-sm text-blue-600 font-medium">1st prize</div>
            <div className="text-xs text-zinc-600">
              6,000,000 baht per prize
            </div>
            <div className="mt-4 flex justify-center gap-4 md:gap-6">
              {getWinningSafe().first.length ? (
                getWinningSafe().first.map((n) => (
                  <div
                    key={n}
                    className="text-3xl sm:text-4xl md:text-6xl font-bold text-red-600 font-mono"
                  >
                    {n}
                  </div>
                ))
              ) : (
                <div className="text-lg text-zinc-600">No data</div>
              )}
            </div>
          </div>

          {/* Last 2 big */}
          <div className="mt-8 text-center">
            <div className="text-sm text-blue-600 font-medium">
              Last 2 digits
            </div>
            <div className="text-xs text-zinc-600">2,000 baht per prize</div>
            <div className="mt-4">
              <div className="text-4xl sm:text-5xl md:text-7xl font-bold text-black font-mono">
                {getWinningSafe().last2[0] ?? "--"}
              </div>
            </div>
          </div>

          {/* 3-digit columns */}
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="text-center">
              <div className="text-sm text-blue-600 font-medium">
                3 digit page number
              </div>
              <div className="text-xs text-zinc-600">4,000 baht per prize</div>
              <div className="mt-4 flex flex-wrap justify-center gap-6 font-mono">
                {getWinningSafe().front3.length ? (
                  getWinningSafe().front3.map((n) => (
                    <div key={n} className="text-2xl font-semibold">
                      {n}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-600">No data</div>
                )}
              </div>
            </div>

            <div className="text-center">
              <div className="text-sm text-blue-600 font-medium">
                Last 3 digits
              </div>
              <div className="text-xs text-zinc-600">4,000 baht per prize</div>
              <div className="mt-4 flex flex-wrap justify-center gap-6 font-mono">
                {getWinningSafe().back3.length ? (
                  getWinningSafe().back3.map((n) => (
                    <div key={n} className="text-2xl font-semibold">
                      {n}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-600">No data</div>
                )}
              </div>
            </div>
          </div>
          {/* Side prize (near 1st) - prominent */}
          <div className="mt-6 text-center">
            <div className="text-sm text-blue-600 font-medium">
              1st Side Prize
            </div>
            <div className="text-xs text-zinc-600">each prize 100,000 baht</div>
            <div className="mt-4 flex flex-wrap justify-center gap-6 md:gap-12">
              {getWinningSafe().side.length ? (
                getWinningSafe().side.map((n) => (
                  <div
                    key={n}
                    className="text-2xl sm:text-3xl md:text-5xl font-bold text-black font-mono"
                  >
                    {n}
                  </div>
                ))
              ) : (
                <div className="text-lg text-zinc-600">No data</div>
              )}
            </div>
          </div>

          {/* Other prize rows: second, third, fourth, fifth */}
          <div className="mt-10 space-y-8">
            <div className="text-center">
              <div className="text-sm text-blue-600 font-medium">2nd prize</div>
              <div className="text-xs text-zinc-600">
                200,000 baht per prize
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-4 font-mono">
                {getWinningSafe().second.length ? (
                  getWinningSafe().second.map((n) => (
                    <div key={n} className="text-base sm:text-lg md:text-xl">
                      {n}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-600">No data</div>
                )}
              </div>
            </div>

            <div className="text-center">
              <div className="text-sm text-blue-600 font-medium">3rd prize</div>
              <div className="text-xs text-zinc-600">80,000 baht per prize</div>
              <div className="mt-4 flex flex-wrap justify-center gap-4 font-mono">
                {getWinningSafe().third.length ? (
                  getWinningSafe().third.map((n) => (
                    <div key={n} className="text-base sm:text-lg md:text-xl">
                      {n}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-600">No data</div>
                )}
              </div>
            </div>

            <div className="text-center">
              <div className="text-sm text-blue-600 font-medium">4th prize</div>
              <div className="text-xs text-zinc-600">40,000 baht per prize</div>
              <div className="mt-4 flex flex-wrap justify-center gap-3 font-mono">
                {getWinningSafe().fourth.length ? (
                  getWinningSafe().fourth.map((n) => (
                    <div key={n} className="text-xs sm:text-sm md:text-base">
                      {n}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-600">No data</div>
                )}
              </div>
            </div>

            <div className="text-center">
              <div className="text-sm text-blue-600 font-medium">5th prize</div>
              <div className="text-xs text-zinc-600">20,000 baht per prize</div>
              <div className="mt-4 flex flex-wrap justify-center gap-3 font-mono">
                {getWinningSafe().fifth.length ? (
                  getWinningSafe().fifth.map((n) => (
                    <div key={n} className="text-xs sm:text-sm md:text-base">
                      {n}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-600">No data</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <label className="font-medium">Your tickets (one per line)</label>
          <textarea
            className="mt-2 w-full rounded border p-2"
            rows={8}
            placeholder="Enter your lottery tickets here, one per line"
            value={ticketsText}
            onChange={(e) => setTicketsText(e.target.value)}
          />
        </section>

        <section className="mt-4">
          <label className="font-medium">Scan QR (optional)</label>
          <div className="mt-2 flex gap-4 items-start">
            <div className="w-56 h-36 bg-black/5 rounded overflow-hidden">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                className="rounded bg-green-600 px-4 py-2 text-white"
                onClick={() => (scanning ? stopScanner() : startScanner())}
                disabled={loading}
              >
                {scanning ? "Stop scanner" : "Start scanner"}
              </button>
              {scannerError && (
                <div className="text-sm text-red-600">{scannerError}</div>
              )}
              <div className="text-sm text-zinc-600">
                When a QR is detected it will be appended to your tickets.
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4">
          <div className="flex gap-2 items-center">
            <button
              className="rounded bg-sky-600 px-4 py-2 text-white"
              onClick={fetchRayLatest}
              disabled={loading}
            >
              {loading ? "Fetching..." : "Fetch latest (Rayriffy)"}
            </button>
            <button
              className="rounded bg-zinc-900 px-4 py-2 text-white"
              onClick={handleCheck}
              disabled={loading}
            >
              {loading ? "Checking..." : "Check"}
            </button>
          </div>
        </section>
        {error && <div className="mt-4 text-red-600">Error: {error}</div>}

        {results && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Results</h2>
            <ul className="mt-2 space-y-2">
              {results.map((r) => (
                <li
                  key={r.ticket}
                  className="flex items-center justify-between rounded border p-3"
                >
                  <div>
                    <div className="font-mono">{r.ticket}</div>
                    <div className="text-sm text-zinc-800">{r.notes}</div>
                  </div>
                  <div className="text-right">
                    {r.rank ? (
                      <span className="text-green-600">{r.rank}</span>
                    ) : r.back3 ? (
                      <span className="text-indigo-600">3-back</span>
                    ) : r.front3 ? (
                      <span className="text-indigo-600">3-front</span>
                    ) : r.last2 ? (
                      <span className="text-amber-600">Last2</span>
                    ) : (
                      <span>No</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
