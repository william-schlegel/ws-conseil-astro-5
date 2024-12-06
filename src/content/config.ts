import { file, glob } from "astro/loaders";
import { defineCollection, reference, z } from "astro:content";

const roleCollection = defineCollection({
  loader: file("src/content/roles.json"),
  schema: z.object({
    id: z.string(),
    image: z.string(),
    langue: z.enum(["fr", "en"]),
    name: z.string(),
  }),
});

const categoryCollection = defineCollection({
  loader: file("src/content/categories.json"),
  schema: z.object({
    id: z.string(),
    description: z.string().optional(),
    langue: z.enum(["fr", "en"]),
    title: z.string(),
    order: z.number().optional().default(0),
  }),
});

const clientCollection = defineCollection({
  loader: file("src/content/clients.json"),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    image: z.string(),
    order: z.number().optional().default(0),
    url: z.string().url().optional(),
  }),
});

const projetCollection = defineCollection({
  loader: glob({ pattern: "*.md*", base: "src/content/projetCollection" }),
  schema: z.object({
    brief: z.string(),
    client: reference("clientCollection"),
    heroImage: z.string(),
    heroImageAlt: z.string(),
    name: z.string(),
    order: z.number().optional().default(0),
    running: z.boolean().optional().default(false),
    slug: z.string(),
    startDate: z.string(),
    roles: z.array(reference("roleCollection")),
    categories: z.array(reference("categoryCollection")),
  }),
});

export const collections = {
  roleCollection,
  categoryCollection,
  clientCollection,
  projetCollection,
};
