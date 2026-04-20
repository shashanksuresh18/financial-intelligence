"use client";

import type { ChangeEvent, FormEvent } from "react";

type SearchBarProps = {
  readonly action?: string;
  readonly defaultValue?: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly onSearch?: (query: string) => void;
  readonly onSubmit?: (query: string) => void;
  readonly disabled?: boolean;
  readonly isSearching?: boolean;
};

export function SearchBar({
  action = "/api/search",
  defaultValue = "",
  value,
  placeholder = "Search for a company",
  onSearch,
  onSubmit,
  disabled = false,
  isSearching = false,
}: SearchBarProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onSearch?.(event.target.value);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    if (onSubmit || onSearch) {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);
      const query = formData.get("q");

      if (typeof query === "string") {
        if (onSubmit) {
          onSubmit(query);
        } else {
          onSearch?.(query);
        }
      }
    }
  };

  return (
    <form
      action={onSearch ? undefined : action}
      className="fi-interactive fi-focus-ring group flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/85 p-3 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.95)] backdrop-blur focus-within:border-emerald-400/30 focus-within:ring-2 focus-within:ring-emerald-400/50"
      onSubmit={onSubmit || onSearch ? handleSubmit : undefined}
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
          isSearching
            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
            : "border-zinc-800 bg-zinc-900 text-zinc-400"
        }`}
      >
        <svg
          aria-hidden="true"
          className={`h-5 w-5 ${isSearching ? "fi-icon-pulse" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="11" cy="11" r="6" />
        </svg>
      </div>

      <input
        aria-label={placeholder}
        autoComplete="off"
        className="min-w-0 flex-1 border-0 bg-transparent px-1 text-sm font-light text-zinc-100 outline-none placeholder:text-zinc-500"
        disabled={disabled}
        name="q"
        onChange={onSearch ? handleChange : undefined}
        placeholder={placeholder}
        spellCheck={false}
        type="search"
        {...(value === undefined ? { defaultValue } : { value })}
      />

      <button
        aria-label="Search company"
        className="fi-focus-ring fi-interactive rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:border-emerald-300/40 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-500"
        disabled={disabled}
        type="submit"
      >
        Search
      </button>
    </form>
  );
}

export default SearchBar;
