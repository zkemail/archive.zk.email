"use client";

import DomainSearchResults from "@/components/DomainSearchResults";
import { SearchInput } from "@/components/SearchInput";
import { JWKArchiveDisplayList } from "@/components/JWKArchiveDisplay";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export default function Home() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const domainQuery = searchParams.get("domain") || "";
  const archiveParam = searchParams.get("archive") as "dkim" | "jwk" | null;
  const [selectedArchive, setSelectedArchive] = useState<"dkim" | "jwk">(archiveParam || "dkim");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!archiveParam) {
      router.replace(`?archive=${selectedArchive}`, { scroll: false });
    }
  }, []);

  const handleArchiveChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newArchive = event.target.value as "dkim" | "jwk";
    setSelectedArchive(newArchive);
    router.push(`?archive=${newArchive}`, { scroll: false });
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center" }}>
      <div style={{ paddingTop: "8rem", paddingBottom: "2rem" }}>
        <select
          id="archive-select"
          value={selectedArchive}
          onChange={handleArchiveChange}
          style={{ padding: "0.5rem", fontSize: "1rem" }}
        >
          <option value="dkim">DKIM Archive</option>
          <option value="jwk">Google JWKs Archive</option>
        </select>
      </div>

      {selectedArchive === 'dkim' ? (
        <>
          <SearchInput domainQuery={domainQuery} setIsLoading={setIsLoading} />
          <DomainSearchResults domainQuery={domainQuery} isLoading={isLoading} setIsLoading={setIsLoading} />
        </>
      ) : (
        <>
          <JWKArchiveDisplayList />
        </>
      )}

      <div style={{ textAlign: "center", marginTop: "5rem", fontSize: "0.8rem" }}>
        <hr style={{ width: "50%", margin: "1rem auto", borderTop: "1px solid black" }} />
        <div>
          <a href="about">About</a> this site
        </div>
        <div>
          Visit the project on <a href="https://github.com/zkemail/archive.prove.email">GitHub</a>
        </div>
        <div>
          Visit <a href="https://prove.email/">Proof of Email</a>
        </div>
        <div>
          <a href="contribute">Contribute</a> to the archive
        </div>
        <div>
          Explore the <a href="api-explorer">API</a>
        </div>
        <div>
          Read the <a href="privacy-policy">Privacy policy</a>
        </div>
      </div>
    </div>
  );
}
