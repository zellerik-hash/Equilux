"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Sektion, die beim Hereinscrollen einmalig erscheint. Nur opacity/transform,
 * unter prefers-reduced-motion ohne Versatz.
 */
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
