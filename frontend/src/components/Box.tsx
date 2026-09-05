import { useEffect, useRef } from "react";
import { animate , spring } from "animejs";

export default function Box() {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!boxRef.current || !contentRef.current) return;

    const box = boxRef.current;
    const content = contentRef.current;

    const targetWidth = Math.min(800, window.innerWidth - 40);

    // 1. Enter from bottom
    animate(box, {
      translateY: [window.innerHeight + 200, -50],
      rotate: [-180, 0],
      duration: 2000,
      ease: "outExpo",

      onComplete: () => {
        // 2. Expand
        animate(box, {
          width: [100, targetWidth],
          height: [100, 140],
          borderRadius: [0, 22],
          duration: 900,
          ease: spring({ bounce: 0.3, duration: 628 }),

          onComplete: () => {
            animate(content, {
              opacity: [0, 1],
              translateY: [15, 0],
              duration: 400,
              ease: "outQuad",
            });
          },
        });
      },
    });
  }, []);

  return (
    <div
      ref={boxRef}
      style={{
        position: "fixed",
        left: "50%",
        top: "50%",

        transform: "translate(-50%, -50%)",

        width: 100,
        height: 100,

        borderRadius: 10,

        background: "#202020",
        border: "1px solid #383838",

        overflow: "hidden",
      }}
    >
      <div
        ref={contentRef}
        style={{
          opacity: 0,
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        {/* Actual text input */}
        <textarea
          placeholder="How can I help you today?"
          style={{
            width: "100%",
            height: "80px",

            padding: "25px",

            boxSizing: "border-box",

            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",

            color: "#fff",
            fontSize: "16px",
            fontFamily: "inherit",
          }}
        />

        {/* Bottom controls */}
        <div
          style={{
            position: "absolute",
            bottom: "18px",
            left: "25px",
            right: "25px",

            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <button>+</button>
            <button>Chat</button>
            <button>Cowork</button>
          </div>

          <div
            style={{
              color: "#aaa",
            }}
          >
            Sonnet 5&nbsp;&nbsp; Medium
          </div>
        </div>
      </div>
    </div>
  );
}