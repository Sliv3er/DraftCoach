import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ChampionData {
  id: string;
  name: string;
  key: string;
}

interface Props {
  champions: ChampionData[];
  selected: string[];
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  max: number;
  getIconUrl: (id: string) => string;
}

export function ChampionPicker({ champions, selected, onSelect, onRemove, max, getIconUrl }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [debouncedQuery, setDebouncedQuery] = useState('');

  const handleInput = useCallback((val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 150);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = champions.filter(
    (c) =>
      !selected.includes(c.id) &&
      c.name.toLowerCase().includes(debouncedQuery.toLowerCase())
  );

  const handleSelect = (id: string) => {
    onSelect(id);
    setQuery('');
    setDebouncedQuery('');
    if (selected.length + 1 >= max) setOpen(false);
  };

  return (
    <div ref={ref}>
      <div className="tags-row">
        {selected.map((id) => {
          const champ = champions.find((c) => c.id === id);
          return (
            <span key={id} className="champ-tag">
              <img
                src={getIconUrl(id)}
                alt={champ?.name || id}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              {champ?.name || id}
              <span className="remove" onClick={() => onRemove(id)}>×</span>
            </span>
          );
        })}
      </div>
      {selected.length < max && (
        <div className="champ-picker">
          <input
            className="champ-search"
            type="text"
            placeholder="Search champion..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => setOpen(true)}
          />
          {open && filtered.length > 0 && (
            <div className="champ-dropdown">
              {filtered.slice(0, 30).map((c) => (
                <div
                  key={c.id}
                  className="champ-option"
                  onClick={() => handleSelect(c.id)}
                >
                  <img
                    src={getIconUrl(c.id)}
                    alt={c.name}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {c.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
