import React, { useState, useEffect } from "react";

export default function OnboardingText({ words, onboarding, pageDone, shown }) {
  const [text, setText] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const typeSpeed = 10; //20
  const deleteSpeed = 5; // 10
  const delaySpeed = 100; // 500

  useEffect(() => {
    if (isDone) return;


    const handleType = () => {
      const currentWord = words[wordIndex];
      if(!currentWord) return;
      if (!isDeleting) {
        setText((prev) => prev + currentWord.charAt(charIndex));
        setCharIndex((prev) => prev + 1);

        if (charIndex + 1 === currentWord.length) {
          setTimeout(() => setIsDeleting(true), delaySpeed);
        }
      } else {
        setText((prev) => prev.slice(0, -1));
        setCharIndex((prev) => prev - 1);

        if (charIndex === 0) {
          setIsDeleting(false);
          setWordIndex((prev) => (prev + 1) % words.length);
          if (wordIndex + 1 === words.length) {
            setIsDone(true);
            pageDone();
          }
        }
      }
    };

    const typingSpeed = isDeleting ? deleteSpeed : typeSpeed;
    const timer = setTimeout(handleType, typingSpeed);

    return () => clearTimeout(timer);
  }, [text, charIndex, isDeleting, wordIndex, isDone, words]);

  useEffect(() => {
    console.log(words)
    setText("");
    setWordIndex(0);
    setCharIndex(0);
    setIsDeleting(false);
    setIsDone(false);
  }, [words]);

  return (
    <div className={`onboardingDiv ${shown ? "shown" : ""}`}>
      <span>{text}</span>
    </div>
  );
}
