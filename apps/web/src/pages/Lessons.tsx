import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { play, stop } from "../audio/synth";
import { Piano } from "../components/Piano";
import { Icon } from "../components/ui";
import { useLessons } from "../state/lessons";
import { usePlayer } from "../state/store";
import { type Question, choiceLabel, question as makeQuestion } from "../theory/ear";
import { nodeView } from "../theory/engine";
import { LESSONS, type Step, lessonBySlug, paragraphs } from "../theory/lessons";
import { pathOf } from "../theory/routes";

function useDone() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.resolve(useLessons.persist.rehydrate()).then(() => setReady(true));
  }, []);
  const done = useLessons((state) => state.done);
  return ready ? done : {};
}

function PlayButton({ id, label, steps, mode }: { id: string; label: string; steps: number[][]; mode: "melodic" | "harmonic" | "sequence" }) {
  const playing = usePlayer((state) => state.playingId === id);
  return (
    <button type="button" onClick={() => (playing ? stop() : play(steps, mode, id))} className="btn btn-ghost">
      <Icon name={playing ? "stop" : "play"} className="size-4" />
      {label}
    </button>
  );
}

function Text({ body }: { body: string }) {
  return (
    <div className="flex max-w-[64ch] flex-col gap-3 text-[1.0625rem] leading-relaxed">
      {paragraphs(body).map((parts, index) => (
        <p key={index}>
          {parts.map((part, i) => (part.strong ? <strong key={i} className="font-semibold text-brass">{part.text}</strong> : <span key={i}>{part.text}</span>))}
        </p>
      ))}
    </div>
  );
}

function QuestionStep({ step }: { step: Extract<Step, { type: "question" }> }) {
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-lg font-semibold">{step.prompt}</p>
      <div className="flex flex-wrap gap-2">
        {step.choices.map((choice) => {
          const state = !chosen ? "idle" : choice === step.answer ? "right" : choice === chosen ? "wrong" : "other";
          return (
            <button
              key={choice}
              type="button"
              disabled={chosen !== null}
              onClick={() => setChosen(choice)}
              className={`min-h-11 rounded-full border px-4 transition-colors duration-150 ${
                state === "right" ? "border-brass bg-[var(--accent-soft)]" : state === "wrong" ? "border-danger" : state === "other" ? "border-line opacity-55" : "border-line hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]"
              }`}
            >
              {choice}
            </button>
          );
        })}
      </div>
      {chosen && (
        <p aria-live="polite" className={chosen === step.answer ? "text-brass" : "text-danger"}>
          {chosen === step.answer ? "Juste." : `Réponse attendue : ${step.answer}.`} <span className="text-ivory-2">{step.explanation}</span>
        </p>
      )}
    </div>
  );
}

/** Quelques questions d'oreille, générées par le moteur. */
function QuizStep({ step, id }: { step: Extract<Step, { type: "quiz" }>; id: string }) {
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState<Question | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  const finished = index >= step.count;

  const start = () => {
    const next = makeQuestion(step.exercise, step.level, null);
    setCurrent(next);
    setChosen(null);
    play(next.steps, next.playing === "timed" ? "sequence" : next.playing, id);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="font-display text-lg font-semibold">{step.label}</p>
      {finished ? (
        <div className="flex flex-wrap items-center gap-3">
          <p>
            {right} sur {step.count}.
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => { setIndex(0); setRight(0); setCurrent(null); }}>
            Recommencer
          </button>
          <Link to="/oreille" className="caption underline underline-offset-4 hover:text-ivory">
            S'entraîner davantage
          </Link>
        </div>
      ) : !current ? (
        <button type="button" onClick={start} className="btn btn-primary self-start">
          <Icon name="play" className="size-4" />
          Écouter la question {index + 1} sur {step.count}
        </button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => play(current.steps, current.playing === "timed" ? "sequence" : current.playing, id)} className="btn text-ivory-2 hover:bg-white/5" aria-label="Réécouter">
              <Icon name="play" className="size-4" />
            </button>
            {current.choices.map((choice) => {
              const { symbol, name } = choiceLabel(step.exercise, choice);
              const state = !chosen ? "idle" : choice.answer === current.answer ? "right" : choice.answer === chosen ? "wrong" : "other";
              return (
                <button
                  key={choice.answer}
                  type="button"
                  disabled={chosen !== null}
                  title={name}
                  onClick={() => {
                    setChosen(choice.answer);
                    if (choice.answer === current.answer) setRight((r) => r + 1);
                  }}
                  className={`min-h-11 rounded-full border px-4 transition-colors duration-150 ${
                    state === "right" ? "border-brass bg-[var(--accent-soft)]" : state === "wrong" ? "border-danger" : state === "other" ? "border-line opacity-55" : "border-line hover:border-[var(--accent-line)]"
                  }`}
                >
                  <span className="font-display font-semibold">{symbol}</span> <span className="caption">{name}</span>
                </button>
              );
            })}
          </div>
          {chosen && (
            <div className="flex flex-wrap items-center gap-3" aria-live="polite">
              <p className={chosen === current.answer ? "text-brass" : "text-danger"}>
                {chosen === current.answer ? "Juste" : "Pas tout à fait"}
                <span className="text-ivory-2"> — {current.reveal}</span>
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setIndex((i) => i + 1);
                  setCurrent(null);
                }}
              >
                {index + 1 < step.count ? "Question suivante" : "Voir le résultat"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StepView({ step, id }: { step: Step; id: string }) {
  switch (step.type) {
    case "text":
      return <Text body={step.body} />;
    case "piano": {
      const view = nodeView(step.node);
      if (!view) return null;
      return (
        <figure className="glass flex flex-col gap-3 p-4">
          <Piano tones={view.tones} played={view.playback.steps.flat()} />
          <figcaption className="caption flex flex-wrap items-center justify-between gap-3">
            {step.caption}
            <PlayButton id={id} label="Écouter" steps={view.playback.steps} mode={view.playback.mode} />
          </figcaption>
        </figure>
      );
    }
    case "listen": {
      const view = nodeView(step.node);
      return view ? <PlayButton id={id} label={step.label} steps={view.playback.steps} mode={view.playback.mode} /> : null;
    }
    case "sequence": {
      const steps = step.nodes.flatMap((node) => nodeView(node)?.playback.steps ?? []);
      return (
        <div className="flex flex-wrap items-center gap-3">
          <PlayButton id={id} label="Écouter" steps={steps} mode="sequence" />
          <span className="max-w-[56ch] text-ivory-2">{step.label}</span>
        </div>
      );
    }
    case "question":
      return <QuestionStep step={step} />;
    case "quiz":
      return <QuizStep step={step} id={id} />;
    case "explore":
      return (
        <Link to={pathOf(step.node)} className="inline-flex items-center gap-2 text-brass underline-offset-4 hover:underline">
          <Icon name="explorer" className="size-4" />
          {step.label}
        </Link>
      );
  }
}

export function LessonsIndex() {
  const done = useDone();
  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <section className="pt-4 sm:pt-8">
        <h1 className="font-display engrave text-[clamp(2rem,5.6vw,3.6rem)] leading-[1.06] font-semibold tracking-[-0.015em]">Apprendre</h1>
        <p className="mt-4 max-w-[62ch] text-ivory-2">
          Des cours courts, à suivre dans l'ordre : chaque notion s'écoute, se voit au piano et se vérifie par une
          question ou un exercice d'oreille.
        </p>
      </section>
      <ol className="flex flex-col">
        {LESSONS.map((lesson) => (
          <li key={lesson.slug} className="border-t border-line">
            <Link to={`/cours/${lesson.slug}`} className="group grid gap-x-6 gap-y-1 py-5 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-baseline">
              <span className="font-display text-2xl font-semibold text-ivory-3 group-hover:text-brass">{lesson.order}</span>
              <span>
                <span className="font-display block text-xl font-semibold group-hover:text-brass">{lesson.title}</span>
                <span className="mt-1 block max-w-[64ch] text-ivory-2">{lesson.summary}</span>
              </span>
              <span className="caption">{done[lesson.slug] ? "terminé" : lesson.level}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function LessonPage() {
  const { slug = "" } = useParams();
  const lesson = lessonBySlug(slug);
  const done = useDone();
  const toggle = useLessons((state) => state.toggle);
  useEffect(() => () => stop(), [slug]);

  if (!lesson) {
    return (
      <section className="pt-8">
        <h1 className="font-display text-4xl font-semibold">Cours introuvable</h1>
        <Link to="/cours" className="mt-4 inline-block text-brass underline underline-offset-4">
          Voir tous les cours
        </Link>
      </section>
    );
  }
  const next = LESSONS.find((other) => other.order === lesson.order + 1);
  return (
    <article className="flex flex-col gap-8 sm:gap-10">
      <header className="pt-4 sm:pt-8">
        <Link to="/cours" className="caption hover:text-ivory">
          Cours {lesson.order} sur {LESSONS.length}, niveau {lesson.level}
        </Link>
        <h1 className="font-display engrave mt-2 text-[clamp(2rem,5.6vw,3.6rem)] leading-[1.06] font-semibold tracking-[-0.015em] text-balance">{lesson.title}</h1>
        <p className="mt-4 max-w-[62ch] text-ivory-2">{lesson.summary}</p>
      </header>
      <ol className="flex flex-col gap-8">
        {lesson.steps.map((step, index) => (
          <li key={index} className="grid gap-3 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
            <span className="font-display text-sm font-semibold text-ivory-3" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <StepView step={step} id={`${lesson.slug}-${index}`} />
            </div>
          </li>
        ))}
      </ol>
      <footer className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <button type="button" onClick={() => toggle(lesson.slug)} className={done[lesson.slug] ? "btn btn-ghost" : "btn btn-primary"}>
          {done[lesson.slug] ? "Terminé : marquer comme à revoir" : "J'ai terminé ce cours"}
        </button>
        {next && (
          <Link to={`/cours/${next.slug}`} className="btn text-ivory-2 hover:bg-white/5">
            Cours suivant : {next.title}
          </Link>
        )}
      </footer>
    </article>
  );
}
