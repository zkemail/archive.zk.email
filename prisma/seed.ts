import { PrismaClient } from '@prisma/client'
import { fetchJsonWebKeySet, fetchx509Cert } from '@/lib/utils'

const prisma = new PrismaClient()

function randomHex(size: number) {
	return [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')
};

const domains = ["example.com", "example.org", "example.net", "mail.example.com"]
const selectors = ["s1", "s2", "20240101"]

async function main() {
	for (const domain of domains) {
		for (const selector of selectors) {
			const dsp = await prisma.domainSelectorPair.create({
				data: {
					domain: domain,
					selector: selector,
					sourceIdentifier: 'seed'
				}
			});
			await prisma.dkimRecord.create({
				data: {
					domainSelectorPairId: dsp.id,
					firstSeenAt: new Date(),
					lastSeenAt: new Date(),
					provenanceVerified: false,
					value: `v=DKIM1; k=rsa; p=${randomHex(100)}`
				}
			});
		}
	}
	await prisma.jsonWebKeySets.create({
		data: {
			jwks: await fetchJsonWebKeySet(),
			x509Certificate: await fetchx509Cert()

		}
	});
}

main()
	.then(async () => {
		await prisma.$disconnect()
	})
	.catch(async (e) => {
		console.error(e)
		await prisma.$disconnect()
		process.exit(1)
	})
