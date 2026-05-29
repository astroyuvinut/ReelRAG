import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// every element with [data-reveal] animates in when it enters the viewport
export default function useScrollReveal() {
  useEffect(() => {
    const elements = gsap.utils.toArray("[data-reveal]");
    const ctx = gsap.context(() => {
      elements.forEach((el) => {
        gsap.fromTo(
          el,
          { y: 60, opacity: 0, filter: "blur(8px)" },
          {
            y: 0,
            opacity: 1,
            filter: "blur(0px)",
            duration: 1.1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: el,
              start: "top 88%",
              toggleActions: "play none none reverse",
            },
          }
        );
      });

      // stagger children
      gsap.utils.toArray("[data-stagger]").forEach((parent) => {
        gsap.fromTo(
          parent.children,
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.9,
            stagger: 0.08,
            ease: "power3.out",
            scrollTrigger: {
              trigger: parent,
              start: "top 85%",
              toggleActions: "play none none reverse",
            },
          }
        );
      });
    });

    return () => ctx.revert();
  }, []);
}
