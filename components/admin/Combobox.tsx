"use client";

// Text input with a styled suggestion list (ARIA 1.2 combobox pattern). Replaces <datalist>,
// which every browser draws differently and which hides the other choices once a value is typed.
// Suggestions only help: any typed value is allowed and the server still validates it.
// The input keeps its `name`, so FormData and form.reset() work as with a plain input.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export function Combobox({
  name,
  options,
  defaultValue = "",
  required,
  error,
  placeholder,
}: {
  name: string;
  options: string[];
  defaultValue?: string;
  required?: boolean;
  error?: string;
  placeholder?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false); // false: show every option (just opened)
  const [active, setActive] = useState(-1);

  const query = value.trim().toLowerCase();
  const shown = filtering && query ? options.filter((o) => o.toLowerCase().includes(query)) : options;
  const custom = value.trim() && !options.some((o) => o.toLowerCase() === query) ? value.trim() : null;
  const items = custom ? [...shown, custom] : shown;

  // form.reset() puts the uncontrolled default back; mirror that for this controlled input.
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const onReset = () => setValue(defaultValue);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue]);

  function show(filter: boolean) {
    setFiltering(filter);
    setOpen(true);
    setActive(-1);
  }

  function choose(option: string) {
    setValue(option);
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show(false);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (items.length ? (a + step + items.length) % items.length : -1));
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault(); // pick the option instead of submitting the form
      choose(items[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const optionId = (i: number) => `${id}-opt-${i}`;

  return (
    <div className="a-combo" data-open={open || undefined}>
      <input
        ref={input}
        name={name}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-invalid={!!error}
        className="a-input"
        onChange={(e) => {
          setValue(e.target.value);
          show(true);
        }}
        onClick={() => !open && show(false)}
        onKeyDown={onKey}
        onBlur={() => setOpen(false)}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "Hide suggestions" : "Show suggestions"}
        className="a-combo-toggle"
        // mousedown, not click: keeps focus in the input so its blur doesn't close the list first.
        onMouseDown={(e) => {
          e.preventDefault();
          if (open) setOpen(false);
          else {
            input.current?.focus();
            show(false);
          }
        }}
      >
        <svg viewBox="0 0 12 8" aria-hidden="true">
          <path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>

      {open && items.length ? (
        // preventDefault on click: inside a <label> (Field), a click would re-activate the input and reopen the list.
        <ul id={`${id}-list`} role="listbox" className="a-combo-list" onClick={(e) => e.preventDefault()}>
          {items.map((option, i) => {
            const isCustom = custom !== null && i === items.length - 1;
            const selected = option.toLowerCase() === value.trim().toLowerCase();
            return (
              <li
                key={isCustom ? "__custom" : option}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                data-active={i === active || undefined}
                data-custom={isCustom || undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {isCustom ? (
                  <span>
                    Use &ldquo;<strong>{option}</strong>&rdquo;
                  </span>
                ) : (
                  <span>{highlight(option, filtering ? query : "")}</span>
                )}
                {selected && !isCustom ? (
                  <svg viewBox="0 0 16 16" aria-hidden="true" className="a-combo-check">
                    <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Bold the part of the option that matches what was typed. */
function highlight(text: string, query: string) {
  const at = query ? text.toLowerCase().indexOf(query) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}
