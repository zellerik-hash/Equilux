import s from "./aurora.module.css";

/** Dekorativer Aurora-Hintergrund. Fixiert hinter dem Inhalt, theme-aware. */
export default function Aurora() {
  return (
    <div className={s.aurora} aria-hidden="true">
      <div className={s.grid} />
      <div className={`${s.blob} ${s.a}`} />
      <div className={`${s.blob} ${s.b}`} />
      <div className={`${s.blob} ${s.c}`} />
    </div>
  );
}
