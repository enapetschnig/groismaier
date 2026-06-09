import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AddressResult = {
  street: string;
  housenumber: string;
  plz: string;
  ort: string;
  land: string;
  displayName: string;
};

type PhotonFeature = {
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    country?: string;
    countrycode?: string;
    state?: string;
    district?: string;
    type?: string;
    osm_value?: string;
  };
};

interface Props {
  /** Current value of the street/address field */
  value: string;
  /** Called when the user types freely (without selecting a suggestion) */
  onChange: (value: string) => void;
  /** Called when the user picks a suggestion — all fields filled */
  onSelect: (address: AddressResult) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  /** Restrict to country code (default: 'at' for Austria) */
  countryCode?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  label = "Adresse",
  placeholder = "Straße und Hausnummer...",
  className,
  required,
  countryCode = "at",
}: Props) {
  const [suggestions, setSuggestions] = useState<PhotonFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = async (q: string) => {
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      // bbox for Austria; no osm_tag filters (those would exclude valid results)
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=de&limit=10${countryCode ? `&bbox=9.5,46.3,17.2,49.1` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      const features: PhotonFeature[] = data.features || [];
      // Filter: AT only + must have a usable name
      const filtered = features.filter((f) => {
        const cc = (f.properties.countrycode || "").toLowerCase();
        if (countryCode && cc !== countryCode.toLowerCase()) return false;
        return !!(f.properties.street || f.properties.name || f.properties.city || f.properties.town || f.properties.village);
      });
      setSuggestions(filtered);
    } catch (err) {
      console.error("Address lookup failed:", err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (newValue: string) => {
    onChange(newValue);
    setShowSuggestions(true);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchSuggestions(newValue), 300);
  };

  const handleSelect = (feature: PhotonFeature) => {
    const p = feature.properties;
    const street = p.street || p.name || "";
    const housenumber = p.housenumber || "";
    const plz = p.postcode || "";
    const ort = p.city || p.town || p.village || "";
    const land = p.country === "Österreich" || p.countrycode?.toLowerCase() === "at" ? "Österreich" : (p.country || "");

    const streetWithNumber = [street, housenumber].filter(Boolean).join(" ");
    const displayName = [streetWithNumber, [plz, ort].filter(Boolean).join(" "), land]
      .filter(Boolean)
      .join(", ");

    onSelect({
      street: streetWithNumber,
      housenumber,
      plz,
      ort,
      land,
      displayName,
    });
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const formatSuggestion = (f: PhotonFeature): string => {
    const p = f.properties;
    const street = [p.street || p.name, p.housenumber].filter(Boolean).join(" ");
    const city = [p.postcode, p.city || p.town || p.village].filter(Boolean).join(" ");
    return [street, city].filter(Boolean).join(", ");
  };

  return (
    <div ref={wrapperRef} className={`relative ${className || ""}`}>
      {label && <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>}
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => value.length >= 3 && setShowSuggestions(true)}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute mt-1 w-full bg-white border rounded-md shadow-lg max-h-[280px] overflow-y-auto" style={{ zIndex: 9999 }}>
          {suggestions.map((f, idx) => (
            <button
              key={idx}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-start gap-2 text-sm border-b last:border-b-0"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(f); }}
            >
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="flex-1">{formatSuggestion(f)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
