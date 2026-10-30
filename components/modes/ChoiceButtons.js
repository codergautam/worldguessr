// Answer buttons for choice-input quiz modes (languages), two columns in the
// QuizGame side panel. Stroke speaks state: picked = primary, right = green,
// wrong = red, the rest dims once the answer is up (styles/quiz.css).

// Pure, so test/modesChoiceState.test.js can pin the matrix.
export function choiceState({ choice, correct, picked, revealed }) {
  if (!revealed) return picked === choice ? 'picked' : 'idle';
  if (choice === correct) return 'correct';
  if (picked === choice) return 'wrong';
  return 'dim';
}

export default function ChoiceButtons({ choices, correct, picked, revealed, labelFor, onPick, disabled }) {
  const locked = disabled || picked != null || revealed;
  return (
    <div className="quizChoices">
      {(choices || []).map((id) => {
        const state = choiceState({ choice: id, correct, picked, revealed });
        return (
          <button
            key={id}
            type="button"
            className={`quizChoice quizChoice--${state} g2_green_button3`}
            disabled={locked}
            onClick={() => { if (!locked) onPick(id); }}
            data-no-click-sfx=""
          >
            {labelFor(id)}
          </button>
        );
      })}
    </div>
  );
}
