"use client";
import { AutocompleteResults, autocomplete } from "@/app/actions";
import { Autocomplete, TextField } from "@mui/material";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import debounce from "lodash/debounce"; // Importing lodash's debounce

interface SearchFormProps {
  domainQuery: string | undefined;
  setIsLoading: (isLoading: boolean) => void;
}

export const SearchInput: React.FC<SearchFormProps> = ({ domainQuery, setIsLoading }) => {
  const router = useRouter();
  const [searchResults, setSearchResults] = useState<AutocompleteResults>([]);
  const [inputValue, setInputValue] = useState<string>(domainQuery || "");

  const debouncedAutocomplete = useCallback(
    debounce(async (value: string) => {
      if (value.trim() !== "") {
        const results = await autocomplete(value);
        setSearchResults(results);
      }
    }, 200),
    []
  );

  const inputChanged = (_event: React.SyntheticEvent, value: string) => {
    setInputValue(value);
    debouncedAutocomplete.cancel();
    if (value) {
      debouncedAutocomplete(value);
    } else {
      setSearchResults([]);
    }
  };

  const onChange = (_event: React.SyntheticEvent, value: string | null) => {
    if (value) {
      setIsLoading(true);
      router.push(`/?domain=${value}`);
    }
  };

  useEffect(() => {
    setInputValue(domainQuery || "");
  }, [domainQuery]);

  useEffect(() => {
    return () => {
      debouncedAutocomplete.cancel();
    };
  }, [debouncedAutocomplete]);

  return (
    <div>
      <Autocomplete
        style={{ margin: "1rem", backgroundColor: "white" }}
        disablePortal
        onInputChange={inputChanged}
        onChange={onChange}
        filterOptions={(x) => x}
        options={searchResults}
        sx={{ width: 300 }}
        freeSolo
        renderInput={(params) => <TextField {...params} label="Domain name" />}
        inputValue={inputValue}
      />
    </div>
  );
};
