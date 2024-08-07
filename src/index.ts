import he from 'he';
import striptags from 'striptags';

interface Subtitle {
  start: string;
  dur: string;
  text: string;
}

interface CaptionTrack {
  baseUrl: string;
  vssId: string;
}

export interface Options {
  videoID?: string;
  lang?: string;
  pageHtml?: string;
  captionDownloadUrl?: string;
}

const getCaptionDownloadUrl = async ({
  videoID,
  lang = 'en',
  pageHtml,
  captionDownloadUrl,
}: Options) => {
  if (captionDownloadUrl) return captionDownloadUrl;

  let html = pageHtml;
  if (!html) {
    if (!videoID) {
      console.warn('No video ID provided');
      return null;
    }
    const response = await fetch(`https://m.youtube.com/watch?v=${videoID}`);
    html = await response.text();
  }

  // Check if the video page contains captions
  if (!html.includes('captionTracks')) {
    console.warn(`No captions found for video: ${videoID}`);
    return null;
  }

  // Extract caption tracks JSON string from video page data
  const regex = /"captionTracks":\s*?((\[.*?\]),)/;
  const regexResult = regex.exec(html);

  if (!regexResult) {
    console.warn(`Failed to extract captionTracks from video: ${videoID}`);
    return null;
  }

  const [_, _match, captionTracksJson] = regexResult;
  const captionTracks = JSON.parse(captionTracksJson);

  // Find the appropriate subtitle language track
  const subtitle =
    captionTracks.find((track: CaptionTrack) => track.vssId === `.${lang}`) ||
    captionTracks.find((track: CaptionTrack) => track.vssId === `a.${lang}`) ||
    captionTracks.find(
      (track: CaptionTrack) => track.vssId && track.vssId.match(`.${lang}`)
    );

  // Check if the subtitle language track exists
  if (!subtitle?.baseUrl) {
    console.warn(`Could not find ${lang} captions for ${videoID}`);
    return null;
  }

  return subtitle.baseUrl as string;
};

export const getSubtitlesDownloadUrl = async (options: Options) => {
  return getCaptionDownloadUrl(options);
};

export const getSubtitles = async (options: Options): Promise<Subtitle[]> => {
  const captionDownloadUrl = await getCaptionDownloadUrl(options);
  if (!captionDownloadUrl) return [];

  // Fetch subtitles XML from the subtitle track URL
  const subtitlesResponse = await fetch(captionDownloadUrl);
  const transcript = await subtitlesResponse.text();

  // Define regex patterns for extracting start and duration times
  const startRegex = /start="([\d.]+)"/;
  const durRegex = /dur="([\d.]+)"/;

  // Process the subtitles XML to create an array of subtitle objects
  const lines = transcript
    .replace('<?xml version="1.0" encoding="utf-8" ?><transcript>', '')
    .replace('</transcript>', '')
    .split('</text>')
    .filter((line: string) => line && line.trim())
    .reduce((acc: Subtitle[], line: string) => {
      // Extract start and duration times using regex patterns
      const startResult = startRegex.exec(line);
      const durResult = durRegex.exec(line);

      if (!startResult || !durResult) {
        console.warn(`Failed to extract start or duration from line: ${line}`);
        return acc;
      }

      const [, start] = startResult;
      const [, dur] = durResult;

      // Clean up subtitle text by removing HTML tags and decoding HTML entities
      const htmlText = line
        .replace(/<text.+>/, '')
        .replace(/&amp;/gi, '&')
        .replace(/<\/?[^>]+(>|$)/g, '');
      const decodedText = he.decode(htmlText);
      const text = striptags(decodedText);

      // Create a subtitle object with start, duration, and text properties
      acc.push({
        start,
        dur,
        text,
      });

      return acc;
    }, []);

  return lines;
};
