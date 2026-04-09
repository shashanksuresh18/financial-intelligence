interface SearchBarProps {
  action?: string;
  defaultValue?: string;
  placeholder?: string;
}

export function SearchBar({
  action = "/api/search",
  defaultValue = "",
  placeholder = "Search for a company",
}: SearchBarProps) {
  return (
    <form action={action} className="flex gap-3 rounded-xl border p-4">
      <input
        className="min-w-0 flex-1 rounded-md border px-3 py-2"
        defaultValue={defaultValue}
        name="q"
        placeholder={placeholder}
        type="search"
      />
      <button
        className="rounded-md bg-black px-4 py-2 text-white"
        type="submit"
      >
        Search
      </button>
    </form>
  );
}

export default SearchBar;
