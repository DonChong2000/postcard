"use client";

import { useState } from "react";
import { Caveat } from "next/font/google";

const caveat = Caveat({ subsets: ["latin"] });

const ADDRESS = ["May Wong", "14 Tai Ping Shan Street", "Sheung Wan, Hong Kong"];
const MESSAGE = "Made this from the photo we took on the ferry. Post is slow — that's the point.";

// ponytail: a trimmed copy of `Card` in app/page.tsx, not a shared component. That one
// takes 13 props for states this page never has (busy, fold guide, watermark, font
// picker) and the landing card is a frozen example. Extract if the back face has to
// change in both places.
export default function SampleCard() {
  const [face, setFace] = useState<"front" | "back">("front");
  const ink = { fontFamily: caveat.style.fontFamily, fontSize: "3.5cqw" };
  const faceClass =
    "absolute inset-0 @container overflow-hidden rounded-[4px] bg-paper [backface-visibility:hidden] shadow-[0_18px_44px_rgba(46,43,37,.28)]";

  return (
    <div className="min-w-0">
      <div className="[perspective:1800px]">
        <div
          onClick={() => setFace((f) => (f === "front" ? "back" : "front"))}
          className="relative aspect-[2480/1748] w-full cursor-pointer transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] [transform-style:preserve-3d]"
          style={{ transform: `rotateY(${face === "back" ? 180 : 0}deg)` }}
        >
          <div className={faceClass}>
            <img
              src="/sample-front.jpg"
              alt="Postcard front generated from a photo"
              className="absolute inset-0 size-full object-cover"
            />
          </div>

          <div className={`${faceClass} grid grid-cols-2 [transform:rotateY(180deg)]`}>
            <img
              src="/sample-back.jpg"
              alt=""
              className="pointer-events-none absolute inset-0 size-full object-cover opacity-15"
            />
            <div
              className="relative overflow-hidden px-[7cqw] pt-[10cqw] pb-[6cqw] leading-[1.7] whitespace-pre-wrap text-neutral-900"
              style={ink}
            >
              {MESSAGE}
            </div>
            <div className="relative flex flex-col gap-[3cqw] px-[7cqw] pt-[7cqw] pb-[6cqw]">
              <div className="h-[17cqw] w-[14cqw] self-end rounded-[1cqw] border-[.3cqw] border-dashed border-[rgba(32,30,29,.25)]" />
              <div className="flex flex-col gap-[4cqw] text-neutral-900" style={ink}>
                {ADDRESS.map((line) => (
                  <div
                    key={line}
                    className="min-h-[3.4cqw] overflow-hidden border-b-[max(1px,0.22cqw)] border-neutral-400 pb-[.6cqw] whitespace-nowrap"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-[14px] text-center text-[12px] text-muted">
        {face === "front"
          ? "Click the card to turn it over"
          : "Message and address print as real text"}
      </p>
    </div>
  );
}
