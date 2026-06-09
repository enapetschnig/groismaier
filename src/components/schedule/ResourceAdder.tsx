import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { RESOURCE_SUGGESTIONS } from "./scheduleUtils";

interface Props {
  existingNames: string[];
  onAdd: (name: string) => void;
}

export function ResourceAdder({ existingNames, onAdd }: Props) {
  const [value, setValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const available = RESOURCE_SUGGESTIONS.filter(
    (s) => !existingNames.includes(s)
  );

  const handleAdd = () => {
    if (value.trim()) {
      onAdd(value.trim());
      setValue("");
      setShowSuggestions(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Input
          className="h-8 text-sm"
          placeholder="Ressource hinzufügen..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        {showSuggestions && available.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-20 bg-popover border rounded-md shadow-md mt-1 py-1 max-h-40 overflow-y-auto">
            {available
              .filter(
                (s) => !value || s.toLowerCase().includes(value.toLowerCase())
              )
              .map((s) => (
                <button
                  key={s}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onAdd(s);
                    setValue("");
                    setShowSuggestions(false);
                  }}
                >
                  {s}
                </button>
              ))}
          </div>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={handleAdd}
        disabled={!value.trim()}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Hinzufügen
      </Button>
    </div>
  );
}
