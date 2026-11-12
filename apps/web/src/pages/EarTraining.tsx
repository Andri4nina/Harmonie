import { useCallback, useEffect, useMemo, useState } from "react";
import { play, playTimed, stop } from "../audio/synth";
import { RhythmNotation } from "../components/RhythmNotation";
import { Icon, Panel } from "../components/ui";
import { useEar } from "../state/ear";
import {
  EXERCISE_LABEL,
  type ExerciseId,
  type Question,
  choiceLabel,
  exercises,
  levelSummary,
  pick,
  progress,
  question as makeQuestion,
  review,
} from "../theory/ear";

const ORDER: ExerciseId[] = ["intervals", "chords", "degrees", "progressions", "rhythm", "melody"];

function keyName(key: string | null): string {
  if (!key) return "";
  const [tonic, mode] = key.split(" ");
  return `${tonic} ${mode === "minor" ? "mineur" : "majeur"}`;
}

export function EarTraining() {
  const { cards, exercise, levels, setExercise, setLevel, save } = useEar();
  const [ready, setReady] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  /** Dictée en cours : degrés déjà saisis (le premier, la tonique, est donné). */
  const [entry, setEntry] = useState<string[]>([]);
  const [score, setScore] = useState({ right: 0, total: 0 });

  const [sync, setSync] = useState<"off" | "signed-out" | "synced" | "error">("off");

  // Progrès enregistrés relus après l'hydratation de la page pré-rendue, puis
  // fusionnés avec ceux du compte si l'analyse en ligne est configurée.
  useEffect(() => {
    let disconnect: (() => void) | undefined;
    let cancelled = false;
    void Promise.resolve(useEar.persist.rehydrate()).then(async () => {
      setReady(true);
      if (!import.meta.env.VITE_API_URL) return;
      const { connect } = await import("../app/earSync");
      const stopSync = await connect((status) => !cancelled && setSync(status));
      if (cancelled) stopSync();
      else disconnect = stopSync;
    });
    return () => {
      cancelled = true;
      disconnect?.();
      stop();
    };
  }, []);

  const catalog = useMemo(() => exercises(), []);
  const levelCount = catalog.find((e) => e.id === exercise)?.levels.length ?? 1;
  const level = Math.min(levels[exercise] ?? 1, levelCount);
  const items = catalog.find((e) => e.id === exercise)?.levels[level - 1]?.items ?? [];
  const cardList = useMemo(() => Object.values(cards), [cards]);

  const listen = useCallback((current: Question) => {
    if (current.timing) playTimed(current.timing.events, current.timing.bpm, "ear");
    else if (current.playing !== "timed") play(current.steps, current.playing, "ear");
  }, []);

  const next = useCallback(() => {
    const item = pick(items, cardList, Date.now(), question?.item ?? null);
    const fresh = makeQuestion(exercise, level, item);
    setQuestion(fresh);
    setChosen(null);
    setEntry(fresh.exercise === "melody" ? ["1"] : []);
    listen(fresh);
  }, [items, cardList, question, exercise, level, listen]);

  const answer = useCallback(
    (choice: string) => {
      if (!question || chosen) return;
      const correct = choice === question.answer;
      setChosen(choice);
      save(review(question.item, cards[question.item], correct, Date.now()));
      setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
    },
    [question, chosen, cards, save],
  );

  const switchTo = (nextExercise: ExerciseId, nextLevel?: number) => {
    stop();
    setExercise(nextExercise);
    if (nextLevel) setLevel(nextExercise, nextLevel);
    setQuestion(null);
    setChosen(null);
    setScore({ right: 0, total: 0 });
  };

  /** Dictée : ajoute un degré ; la réponse part dès que la mélodie est complète. */
  const type = useCallback(
    (degree: string) => {
      if (!question || chosen || entry.length >= question.answer_length) return;
      const next = [...entry, degree];
      setEntry(next);
      if (next.length === question.answer_length) answer(next.join(" "));
    },
    [question, chosen, entry, answer],
  );

  // Clavier : chiffres pour répondre, espace pour réécouter, Entrée pour continuer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === " " && question) {
        event.preventDefault();
        listen(question);
      } else if (event.key === "Enter" && (chosen || !question)) {
        event.preventDefault();
        next();
      } else if (question && !chosen && question.exercise === "melody" && event.key === "Backspace") {
        setEntry((current) => (current.length > 1 ? current.slice(0, -1) : current));
      } else if (question && !chosen && /^[1-9]$/.test(event.key)) {
        const choice = question.choices[Number(event.key) - 1];
        if (!choice) return;
        if (question.exercise === "melody") type(choice.answer);
        else answer(choice.answer);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question, chosen, listen, next, answer, type]);

  const label = EXERCISE_LABEL[exercise];
  const minor = question?.key?.endsWith("minor") ?? false;
  const correctChoice = question?.choices.find((c) => c.answer === question.answer);

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <section className="pt-4 sm:pt-8">
        <h1 className="font-display engrave text-[clamp(2rem,5.6vw,3.6rem)] leading-[1.06] font-semibold tracking-[-0.015em] text-balance">
          Entraîner l'oreille
        </h1>
        <p className="mt-4 max-w-[62ch] text-ivory-2">
          Écoutez, répondez, recommencez. Les éléments que vous manquez reviennent vite{" "}; ceux que vous reconnaissez
          s'espacent. {sync === "synced" ? "Vos progrès suivent votre compte." : "Vos progrès restent sur cet appareil."}
        </p>
      </section>

      <div role="tablist" aria-label="Exercice" className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
        {ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={exercise === id}
            onClick={() => switchTo(id)}
            className={`rounded-[18px] border px-4 py-3 text-left transition-colors duration-150 ${
              exercise === id ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-line hover:border-ivory/30"
            }`}
          >
            <span className={`font-display block text-lg font-semibold ${exercise === id ? "text-brass" : ""}`}>{EXERCISE_LABEL[id].name}</span>
            <span className="caption mt-1 block">{EXERCISE_LABEL[id].hint}</span>
          </button>
        ))}
      </div>

      <div>
        <p className="section-title mb-3">Niveau</p>
        <div className="flex flex-wrap gap-2">
          {catalog
            .find((e) => e.id === exercise)
            ?.levels.map((entry) => {
              const done = ready ? progress(exercise, entry.level, cardList) : { mastered: 0, total: entry.items.length };
              const active = entry.level === level;
              return (
                <button
                  key={entry.level}
                  type="button"
                  aria-pressed={active}
                  onClick={() => switchTo(exercise, entry.level)}
                  title={levelSummary(exercise, entry.items)}
                  className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors duration-150 ${
                    active ? "border-brass bg-[var(--accent-soft)] text-brass" : "border-line text-ivory-2 hover:text-ivory"
                  }`}
                >
                  <span className="font-display font-semibold">{entry.level}</span>
                  <span>
                    {done.mastered === done.total && done.total > 0 ? "maîtrisé" : `${done.mastered} sur ${done.total}`}
                  </span>
                </button>
              );
            })}
        </div>
        <p className="caption mt-2">{levelSummary(exercise, items)}. Un élément est maîtrisé après trois bonnes réponses de suite.</p>
      </div>

      <Panel>
        {!question ? (
          <div className="flex flex-col items-start gap-4 py-4">
            <p className="font-display text-2xl font-semibold">{label.prompt}</p>
            <p className="text-ivory-2">{label.hint}</p>
            <button type="button" onClick={next} className="btn btn-primary">
              <Icon name="play" className="size-4" />
              Commencer
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" onClick={() => listen(question)} className="btn btn-primary size-14 !p-0" aria-label="Réécouter">
                <Icon name="play" className="size-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-display text-2xl font-semibold">{label.prompt}</p>
                {question.key && (
                  <p className="caption">
                    {exercise === "degrees" ? "Tonalité de la cadence" : "Tonalité"}
                    {" "}: {keyName(question.key)}
                    {exercise === "melody" ? ". La mélodie commence sur la tonique." : ""}
                  </p>
                )}
              </div>
              <p className="caption" aria-live="polite">
                {score.right} sur {score.total}
              </p>
            </div>

            {exercise === "melody" ? (
              <div className="flex flex-col gap-4">
                <ol className="flex flex-wrap gap-2" aria-label="Votre dictée">
                  {Array.from({ length: question.answer_length }, (_, index) => {
                    const typed = entry[index];
                    const expected = question.answer.split(" ")[index];
                    const verdict = chosen ? (typed === expected ? "right" : "wrong") : "idle";
                    return (
                      <li
                        key={index}
                        className={`flex size-14 flex-col items-center justify-center rounded-[14px] border ${
                          verdict === "right" ? "border-brass bg-[var(--accent-soft)]" : verdict === "wrong" ? "border-danger" : typed ? "border-[var(--accent-line)]" : "border-dashed border-line"
                        }`}
                      >
                        <span className="font-display text-xl font-semibold">{typed ?? ""}</span>
                        {verdict === "wrong" && <span className="caption">{expected}</span>}
                      </li>
                    );
                  })}
                </ol>
                {!chosen && (
                  <div className="flex flex-wrap gap-2">
                    {question.choices.map((choice) => {
                      const { symbol, name } = choiceLabel(exercise, choice, minor);
                      return (
                        <button
                          key={choice.answer}
                          type="button"
                          onClick={() => type(choice.answer)}
                          title={name}
                          className="flex min-h-14 min-w-14 flex-col items-center justify-center rounded-[14px] border border-line px-3 hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]"
                        >
                          <span className="font-display text-lg font-semibold">{symbol}</span>
                          <span className="caption hidden sm:block">{name}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setEntry((current) => (current.length > 1 ? current.slice(0, -1) : current))}
                      disabled={entry.length <= 1}
                      className="btn text-ivory-2 hover:bg-white/5"
                    >
                      Effacer
                    </button>
                  </div>
                )}
              </div>
            ) : (
            <div className={`grid gap-2 ${exercise === "progressions" || exercise === "rhythm" ? "sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}`}>
              {question.choices.map((choice, index) => {
                const { symbol, name } = choiceLabel(exercise, choice, minor);
                const isAnswer = choice.answer === question.answer;
                const isChosen = choice.answer === chosen;
                const state = !chosen ? "idle" : isAnswer ? "right" : isChosen ? "wrong" : "other";
                return (
                  <button
                    key={choice.answer}
                    type="button"
                    disabled={chosen !== null}
                    onClick={() => answer(choice.answer)}
                    className={`flex min-h-16 flex-col items-start justify-center rounded-[14px] border px-4 py-2 text-left transition-colors duration-150 ${
                      state === "right"
                        ? "border-brass bg-[var(--accent-soft)]"
                        : state === "wrong"
                          ? "border-danger"
                          : state === "other"
                            ? "border-line opacity-55"
                            : "border-line hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]"
                    }`}
                  >
                    <span className="flex w-full items-baseline justify-between gap-2">
                      {exercise === "rhythm" ? (
                        <RhythmNotation pattern={choice.answer} label={name} />
                      ) : (
                        <span className="font-display text-lg font-semibold">{symbol}</span>
                      )}
                      <span className="caption hidden sm:inline">{index < 9 ? index + 1 : ""}</span>
                    </span>
                    {exercise !== "rhythm" && <span className="caption">{name}</span>}
                  </button>
                );
              })}
            </div>

            )}

            {chosen && (correctChoice || exercise === "melody") && (
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5" aria-live="polite">
                <p className={chosen === question.answer ? "text-brass" : "text-danger"}>
                  {chosen === question.answer
                    ? "Juste"
                    : exercise === "melody"
                      ? `Réponse attendue : ${question.answer}`
                      : `Réponse attendue : ${correctChoice ? choiceLabel(exercise, correctChoice, minor).name : ""}`}
                  <span className="text-ivory-2">{" — "}{question.reveal}</span>
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => listen(question)} className="btn text-ivory-2 hover:bg-white/5">
                    Réécouter
                  </button>
                  <button type="button" onClick={next} className="btn btn-primary">
                    Question suivante
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Panel>
      {sync === "signed-out" && (
        <p className="caption">
          Connectez-vous depuis{" "}
          <a href="/analyser" className="underline underline-offset-4 hover:text-ivory">
            Analyser un morceau
          </a>{" "}
          pour retrouver vos progrès sur tous vos appareils.
        </p>
      )}
      {sync === "error" && <p className="caption text-danger">Vos progrès n'ont pas pu être synchronisés ; ils restent sur cet appareil.</p>}
      <p className="caption hidden sm:block">Raccourcis{" "}: chiffres pour répondre (dictée : un chiffre par note, retour arrière pour effacer), espace pour réécouter, Entrée pour continuer.</p>
    </div>
  );
}
