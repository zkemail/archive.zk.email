"use server";
import { prisma } from "@/lib/db";
import { DkimRecord, DomainSelectorPair, Prisma } from "@prisma/client";

export type AutocompleteResults = string[];

export async function autocomplete(query: string) {
  if (!query) return [];

  if (!query.includes(".") && !query.includes("-")) {
    const dsps = await prisma.domainSelectorPair.findMany({
      distinct: ["domain"],
      where: { domain: { startsWith: query } },
      orderBy: { domain: "asc" },
      take: 8,
      select: {
        domain: true,
      },
    });

    return dsps.map((d) => d.domain);
  }

  const modifiedQuery = query.replace(/\./g, "-");
  const modifiedQuery2 = query.replace(/\-/g, ".");

  const dsps = await prisma.domainSelectorPair.findMany({
    distinct: ["domain"],
    where: {
      OR: [
        {
          domain: {
            contains: query,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          domain: {
            contains: modifiedQuery,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          domain: {
            contains: modifiedQuery2,
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ],
    },
    orderBy: { domain: "asc" },
    take: 8,
    select: {
      domain: true,
    },
  });

  const results = dsps.map((d) => d.domain);

  return results.sort((a, b) => {
    const aStartsWithQuery = a.toLowerCase().startsWith(query.toLowerCase());
    const bStartsWithQuery = b.toLowerCase().startsWith(query.toLowerCase());

    return aStartsWithQuery === bStartsWithQuery ? 0 : aStartsWithQuery ? -1 : 1;
  });
}

export type RecordWithSelector = DkimRecord & { domainSelectorPair: DomainSelectorPair };

export async function findKeysPaginated(
  domainQuery: string,
  cursorIndex: number | null
): Promise<RecordWithSelector[]> {
  let cursorObj = {};
  if (cursorIndex) {
    cursorObj = {
      cursor: { id: cursorIndex },
      skip: 1,
    };
  }

  return await prisma.dkimRecord.findMany({
    where: {
      domainSelectorPair: {
        domain: {
          startsWith: domainQuery,
        },
      },
    },
    include: {
      domainSelectorPair: true,
    },
    take: 25,
    orderBy: { domainSelectorPair: { domain: "asc" } },
    ...cursorObj,
  });
}

export async function findKeysPaginatedModifiedQuery(domainQuery: string, cursorIndex: number | null) {
  let cursorObj = {};
  if (cursorIndex) {
    cursorObj = {
      cursor: { id: cursorIndex },
      skip: 1,
    };
  }

  const modifiedQuery = domainQuery.replace(/\./g, "-");
  const modifiedQuery2 = domainQuery.replace(/\-/g, ".");

  return await prisma.dkimRecord.findMany({
    where: {
      domainSelectorPair: {
        OR: [
          {
            domain: {
              contains: domainQuery,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            domain: {
              contains: modifiedQuery,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            domain: {
              contains: modifiedQuery2,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      },
    },
    include: {
      domainSelectorPair: true,
    },
    orderBy: [{ domainSelectorPair: { domain: "asc" } }],
    take: 25,
    ...cursorObj,
  });
}
