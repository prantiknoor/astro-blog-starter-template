import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { Octokit } from 'octokit';
import matter from 'gray-matter';

/**
 * GitHub Integration via Octokit
 */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = "prantiknoor";
const REPO = "astro-blog-starter-template";

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function uploadImage(file: File) {
    console.log('Octokit: Uploading image', file.name);
    const buffer = await file.arrayBuffer();
    const content = Buffer.from(buffer).toString('base64');
    const path = `public/images/${Date.now()}-${file.name}`;
    
    await octokit.rest.repos.createOrUpdateFileContents({
        owner: OWNER!,
        repo: REPO!,
        path,
        message: `Upload image: ${file.name}`,
        content,
    });

    return `/${path.replace('public/', '')}`;
}

function generateMarkdown(input: any, imageUrl?: string) {
    return `---
title: "${input.title}"
description: "${input.description}"
pubDate: "${input.pubDate}"
heroImage: "${imageUrl || input.heroImage || ''}"
---

${input.content}`;
}


const getFileContent = async (path: string) => {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: OWNER!,
            repo: REPO!,
            path: `src/content/blog/${path}`,
        });
        return data as any;
    } catch (e: any) {
        if (e.status === 404) return null;
        throw e;
    }
}


export const server = {
  listPosts: defineAction({
    handler: async () => {
      console.log('Octokit: Listing Posts');
      // 1. Get directory content
      const { data: files } = await octokit.rest.repos.getContent({
          owner: OWNER!,
          repo: REPO!,
          path: 'src/content/blog',
      });

      if (!Array.isArray(files)) return { posts: [] };

      // 2. Fetch all .md files and parse their frontmatter
      const posts = await Promise.all(
          files
            .filter(file => file.name.endsWith('.md'))
            .map(async (file) => {
                const contentData = await getFileContent(file.name);
                if (!contentData) return null;
                
                const decoded = decodeURIComponent(escape(atob(contentData.content)));
                const { data } = matter(decoded);
                const slug = file.name.replace('.md', '');
                
                return {
                    id: slug,
                    data: {
                        title: data.title || 'Untitled',
                        description: data.description || '',
                        pubDate: data.pubDate ? new Date(data.pubDate) : new Date(),
                        heroImage: data.heroImage
                    }
                };
            })
      );

      // Clean up null and sort by date descending
      const filteredPosts = posts
          .filter(p => p !== null)
          .sort((a, b) => b!.data.pubDate.getTime() - a!.data.pubDate.getTime());

      return { success: true, posts: filteredPosts };
    }
  }),

  getPost: defineAction({

    input: z.object({ slug: z.string() }),
    handler: async (input) => {
      console.log('Octokit: Fetching Post', input.slug);
      const file = await getFileContent(`${input.slug}.md`);
      if (!file) throw new Error('Post not found on GitHub');

      // GitHub content is base64 encoded
      const decodedContent = decodeURIComponent(escape(atob(file.content)));
      const { data, content: body } = matter(decodedContent);

      return {
          id: input.slug,
          data: {
              title: data.title,
              description: data.description,
              pubDate: data.pubDate,
              heroImage: data.heroImage
          },
          body
      };
    }
  }),

  createPost: defineAction({
    accept: 'form',
    input: z.object({
      title: z.string().min(3),
      description: z.string().min(10),
      pubDate: z.string(),
      heroImage: z.any().optional(),
      content: z.string().min(50),
    }),
    handler: async (input) => {
      let imageUrl = '';
      if (input.heroImage instanceof File && input.heroImage.size > 0) {
          imageUrl = await uploadImage(input.heroImage);
      }

      console.log('GitHub: Creating Post', input.title);
      const slug = input.title.toLowerCase().replace(/\s+/g, '-');
      const content = btoa(unescape(encodeURIComponent(generateMarkdown(input, imageUrl))));
      
      await octokit.rest.repos.createOrUpdateFileContents({
          owner: OWNER!,
          repo: REPO!,
          path: `src/content/blog/${slug}.md`,
          message: `Create blog post: ${input.title}`,
          content: content
      });
      
      return { success: true, slug };
    },
  }),

  updatePost: defineAction({
    accept: 'form',
    input: z.object({
      slug: z.string(),
      title: z.string().min(3),
      description: z.string().min(10),
      pubDate: z.string(),
      heroImage: z.any().optional(),
      currentHeroImage: z.string().optional(),
      content: z.string().min(50),
    }),
    handler: async (input) => {
      let imageUrl = input.currentHeroImage;
      
      if (input.heroImage instanceof File && input.heroImage.size > 0) {
          imageUrl = await uploadImage(input.heroImage);
      }

      console.log('GitHub: Updating Post', input.slug);
      
      const file = await getFileContent(`${input.slug}.md`);
      if (!file) throw new Error('Post not found on GitHub');

      const content = btoa(unescape(encodeURIComponent(generateMarkdown(input, imageUrl))));
      
      await octokit.rest.repos.createOrUpdateFileContents({
          owner: OWNER!,
          repo: REPO!,
          path: `src/content/blog/${input.slug}.md`,
          message: `Update blog post: ${input.title}`,
          content: content,
          sha: file.sha
      });

      return { success: true };
    },
  }),



  deletePost: defineAction({
    accept: 'json',
    input: z.object({
      slug: z.string(),
    }),
    handler: async (input) => {
      console.log('Octokit: Deleting Post', input.slug);
      
      const file = await getFileContent(`${input.slug}.md`);
      if (!file) throw new Error('Post not found on GitHub');

      await octokit.rest.repos.deleteFile({
          owner: OWNER!,
          repo: REPO!,
          path: `src/content/blog/${input.slug}.md`,
          message: `Delete blog post: ${input.slug}`,
          sha: file.sha
      });
      
      return { success: true };
    },
  }),
};



