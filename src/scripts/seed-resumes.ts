import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { getSupabase } from '../config/supabase';
import { Resume } from '../entities/resume';

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// Keep this list explicit: chaiti_cv.pdf was deliberately excluded from the seed.
const resumeFilenames = [
  '____Novodip_Frontend_Resume.pdf',
  'Novodip_FullStack_Resume.pdf',
  'Novodip_React_Resume.pdf',
  'Novodip_Frontend_Dev_Resume(Tulvo).pdf',
  'Novodip_Frontend_Developer_Brac_IT.pdf',
  'Novodip Frontend Resume.pdf',
  'Novodip_Mondal_Resume_Flyte.pdf',
  'Novodip_Mondal_Resume_Jumpshare.pdf',
  'Novodip_Interlink_Techsoft_Resume.pdf',
  'Novodip_Nymph_Resume.pdf',
] as const;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} before running this seed.`);
  return value;
}

function assertOwnerId(ownerId: string): void {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(ownerId)) throw new Error('RESUME_SEED_OWNER_ID must be a UUID.');
}

function seedObjectName(index: number, batch: string): string {
  const number = String(index + 1).padStart(2, '0');
  return batch === 'primary' ? `seed-resume-${number}.pdf` : `seed-${batch}-resume-${number}.pdf`;
}

function assertBatch(batch: string): void {
  if (!/^[a-z0-9-]{1,40}$/.test(batch)) {
    throw new Error('RESUME_SEED_BATCH must contain 1â€“40 lowercase letters, numbers, or hyphens.');
  }
}

async function main() {
  const ownerId = requiredEnvironment('RESUME_SEED_OWNER_ID');
  const resumeDirectory = process.env.RESUME_SEED_DIRECTORY?.trim() || 'E:\\CV';
  const batch = process.env.RESUME_SEED_BATCH?.trim() || 'primary';
  assertOwnerId(ownerId);
  assertBatch(batch);

  const supabase = getSupabase();
  const { data: owner, error: ownerError } = await supabase.auth.admin.getUserById(ownerId);
  if (ownerError || !owner.user) {
    throw new Error(`The seed owner does not exist in Supabase Auth: ${ownerError?.message ?? ownerId}`);
  }

  await AppDataSource.initialize();
  const repository = AppDataSource.getRepository(Resume);
  let created = 0;
  let skipped = 0;

  try {
    for (const [index, originalFilename] of resumeFilenames.entries()) {
      const storagePath = `${ownerId}/${seedObjectName(index, batch)}`;
      const existing = await repository.findOneBy({ storagePath });
      if (existing) {
        skipped += 1;
        console.log(`Skipped ${originalFilename}; its post already exists.`);
        continue;
      }

      const localPath = join(resumeDirectory, originalFilename);
      const file = await readFile(localPath);
      if (file.byteLength > MAX_RESUME_BYTES) {
        throw new Error(`${basename(localPath)} exceeds the ${MAX_RESUME_BYTES / 1024 / 1024} MiB bucket limit.`);
      }
      if (file.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new Error(`${basename(localPath)} is not a PDF file.`);
      }

      const { error: uploadError } = await supabase.storage
        .from(env.supabaseResumeBucket)
        .upload(storagePath, file, { contentType: 'application/pdf', upsert: false });
      if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
        throw new Error(`Could not upload ${originalFilename}: ${uploadError.message}`);
      }

      await repository.save(
        repository.create({
          ownerId,
          storagePath,
          originalFilename,
          title:
            batch === 'primary'
              ? originalFilename.replace(/\.pdf$/i, '')
              : `${originalFilename.replace(/\.pdf$/i, '')} (test batch ${batch})`,
          mimeType: 'application/pdf',
        }),
      );
      created += 1;
      console.log(`Seeded ${originalFilename}.`);
    }
  } finally {
    await AppDataSource.destroy();
  }

  console.log(`Resume seed complete: ${created} created, ${skipped} already present.`);
}

main().catch((error: unknown) => {
  console.error('Resume seed failed:', (error as Error).message);
  process.exitCode = 1;
});
