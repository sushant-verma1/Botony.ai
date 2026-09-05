import { useEffect, useRef } from "react";
import { animate } from "animejs";

export default function ReviewBox() {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!boxRef.current || !contentRef.current) return;

    const box = boxRef.current;
    const content = contentRef.current;

    const targetWidth = window.innerWidth - 120;
    const targetHeight = 480;

    animate(box, {
      width: [100, targetWidth],
      height: [100, targetHeight],
      borderRadius: [50, 35],

      duration: 1000,
      ease: "outExpo",

      onComplete: () => {
        animate(content, {
          opacity: [0, 1],
          translateY: [20, 0],

          duration: 500,
          ease: "outQuad",
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

        borderRadius: 50,
        background: "white",
        border: "1px solid #ddd",

        overflow: "hidden",
      }}
    >
      <div
        ref={contentRef}
        style={{
          opacity: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <div className="prompt">
          What should be reviewed?
        </div>

        <div className="bottom-bar">
          <button>+</button>
          <button>Set limit</button>
          <button>▶ Run check</button>
        </div>
      </div>
    </div>
  );
}