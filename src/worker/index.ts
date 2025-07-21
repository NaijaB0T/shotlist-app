import { Hono } from "hono";
import { cors } from 'hono/cors';

// --- Type Definitions ---
// (No changes here)
type Env = {
  REFERENCES_EMAILS_KV: KVNamespace;
};
interface EmailPayload {
  email?: string;
}
interface FlimImage {
  id: string; title: string; year: string; category: string; caption: string; directors: string[]; artists: string[]; production_companies: string[]; brands: string[] | null; thumbnail_url: string; medium_resolution_url: string; video_urls?: { url_thumbnail?: string | null }; has_video_urls: boolean; size: { width: number, height: number };
}
interface FlimApiResponse {
  query_response: { total_number_of_results: number; number_of_results: number; images: FlimImage[]; }
}
interface FlimSuggestResponse {
  suggestions: { entity: string; /* ... other properties ... */ }[];
}
interface FlimMetasResponse {
  detailed_image: {
    image: FlimImage;
    similar_images: FlimImage[];
    associated_searches: string[];
    cinematographers: string[];
    proportionned_colors: { color: string }[];
    colors: string[];
    imdb_url?: string;
  };
}

// --- Hono App Initialization ---

// --- THIS IS THE KEY FIX ---
// Tell Hono that all routes in this file are prefixed with /api
const app = new Hono<{ Bindings: Env }>().basePath('/api');

// --- Middleware ---
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// --- Route Handlers ---

/**
 * Route: POST /api/addEmail
 * (The path is now automatically prefixed by .basePath())
 */
app.post('/addEmail', async (c) => {
  const { REFERENCES_EMAILS_KV } = c.env;

  if (!REFERENCES_EMAILS_KV) {
    return c.json({
      success: false,
      error: 'KV Namespace (REFERENCES_EMAILS_KV) is not bound to this worker.',
    }, 500);
  }

  try {
    const body = await c.req.json<EmailPayload>();
    const email = body.email;

    if (!email) {
      return c.json({ success: false, error: 'Email is required.' }, 400);
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json({ success: false, error: 'Invalid email format.' }, 400);
    }

    await REFERENCES_EMAILS_KV.put(email, new Date().toISOString());
    return c.json({ success: true, message: 'Email added successfully.' });
  } catch (error: any) {
    return c.json({
      success: false,
      error: 'An error occurred while processing the request.',
      details: error.message,
    }, 500);
  }
});

/**
 * Route: POST /api/metas
 * Get detailed image metadata and similar images
 */
app.post('/metas', async (c) => {
  try {
    const body = await c.req.json<{ id: string }>();
    const imageId = body.id;

    if (!imageId) {
      return c.json({ success: false, error: 'Image ID is required.' }, 400);
    }

    const apiHeaders = { 
      'accept': '*/*', 
      'content-type': 'application/json', 
      'origin': 'https://app.flim.ai', 
      'referer': 'https://app.flim.ai/', 
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36' 
    };

    const metasApiUrl = 'https://api.flim.ai/2.0.0/metas';
    const requestBody = { id: imageId };
    
    const apiResponse = await fetch(metasApiUrl, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify(requestBody)
    });

    if (!apiResponse.ok) {
      throw new Error(`Flim.ai Metas API error (Status: ${apiResponse.status})`);
    }

    const apiData: FlimMetasResponse = await apiResponse.json();
    
    // Transform similar images to match our frontend format
    const similarImages = apiData.detailed_image.similar_images.map(img => ({
      id: img.id,
      title: img.title || 'N/A',
      year: img.year,
      category: img.category,
      caption: img.caption,
      source_info: {
        directors: img.directors || [],
        artists: img.artists || [],
        production_companies: img.production_companies || [],
        brand: img.brands ? img.brands[0] : null
      },
      urls: {
        thumbnail: img.thumbnail_url,
        medium_resolution: img.medium_resolution_url,
        video_thumbnail: img.video_urls?.url_thumbnail || null
      },
      has_video: img.has_video_urls,
      size: img.size
    }));

    return c.json({
      success: true,
      data: {
        similar_images: similarImages,
        associated_searches: apiData.detailed_image.associated_searches,
        cinematographers: apiData.detailed_image.cinematographers,
        colors: apiData.detailed_image.colors,
        imdb_url: apiData.detailed_image.imdb_url
      }
    });

  } catch (error: any) {
    console.error(error.stack);
    return c.json({
      success: false,
      error: 'An internal error occurred while fetching image metadata.',
      details: error.message
    }, 500);
  }
});

/**
 * Route: GET /api
 * (The path is now automatically prefixed by .basePath())
 */
app.get('/', async (c) => {
  const query = c.req.query('query') || '';
  const director = c.req.query('director') || '';
  const actor = c.req.query('actor') || '';
  const artist = c.req.query('artist') || '';
  const movieName = c.req.query('movieName') || '';
  const movieId = c.req.query('movieId') || '';

  if (!query && !director && !actor && !artist && !movieName && !movieId) {
    return c.json({ success: false, error: 'Search query or at least one filter is required.' }, 400);
  }

  const pageParam = c.req.query('page') || '0';
  const pageNumber = parseInt(pageParam, 10);
  const apiHeaders = { 'accept': '*/*', 'content-type': 'application/json', 'origin': 'https://app.flim.ai', 'referer': 'https://app.flim.ai/', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36' };

  try {
    if (movieName) {
      const suggestApiUrl = 'https://api.flim.ai/2.0.0/suggest-entities';
      const suggestRequestBody = { suggest: movieName };
      const suggestApiResponse = await fetch(suggestApiUrl, { method: 'POST', headers: apiHeaders, body: JSON.stringify(suggestRequestBody) });
      if (!suggestApiResponse.ok) throw new Error(`Flim.ai Suggest API error (Status: ${suggestApiResponse.status})`);
      const suggestApiData: FlimSuggestResponse = await suggestApiResponse.json();
      const filteredSuggestions = suggestApiData.suggestions.filter((s) => s.entity === 'ENTITY_MOVIE' || s.entity === 'ENTITY_MUSIC_VIDEO');
      return c.json({ success: true, query: movieName, results_count: filteredSuggestions.length, data: filteredSuggestions });
    } else {
      const flimApiUrl = 'https://api.flim.ai/2.0.0/search';
      const requestBody = { search: { full_text: query, director, actor, artist, movie_id: movieId, filters: { genres: [], colors: [], number_of_persons: [], years: [], shot_types: [], movie_types: [], aspect_ratio: [], safety_content: [], has_video_cuts: false, camera_motions: [] }, negative_filters: { aspect_ratio: [], genres: ['ANIMATION'], movie_types: [], colors: [], shot_types: [], number_of_persons: [], years: [], safety_content: ['nudity', 'violence'] } }, page: isNaN(pageNumber) ? 0 : pageNumber, number_per_pages: 50 };
      const apiResponse = await fetch(flimApiUrl, { method: 'POST', headers: apiHeaders, body: JSON.stringify(requestBody) });
      if (!apiResponse.ok) throw new Error(`Flim.ai API error (Status: ${apiResponse.status})`);
      const apiData: FlimApiResponse = await apiResponse.json();
      const structuredResults = apiData.query_response.images.map(img => ({ id: img.id, title: img.title || 'N/A', year: img.year, category: img.category, caption: img.caption, source_info: { directors: img.directors || [], artists: img.artists || [], production_companies: img.production_companies || [], brand: img.brands ? img.brands[0] : null }, urls: { thumbnail: img.thumbnail_url, medium_resolution: img.medium_resolution_url, video_thumbnail: img.video_urls?.url_thumbnail || null }, has_video: img.has_video_urls, size: img.size }));
      return c.json({ success: true, query: query || director || artist, currentPage: pageNumber, total_available: apiData.query_response.total_number_of_results, results_count: apiData.query_response.number_of_results, data: structuredResults });
    }
  } catch (error: any) {
    console.error(error.stack);
    return c.json({ success: false, error: 'An internal error occurred while contacting the search service.', details: error.message }, 500);
  }
});

export default app;