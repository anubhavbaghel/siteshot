# SiteShot

SiteShot is a desktop application that automates website screenshot capture and AI-powered alt-text generation for web accessibility.

Instead of manually taking screenshots, uploading them to an AI model, and copying the generated alt text back into your website, SiteShot completes the entire workflow automatically.

## Features

* Crawl an entire website automatically
* Capture screenshots of every page
* Scroll pages to load lazy-loaded content before capturing
* Generate UK-compatible alt text using Google Gemini
* Produce an organised HTML report
* Group results page-wise and section-wise
* Click any alt text to copy it directly to the clipboard
* Run the entire process in the background while you continue working

## Why SiteShot?

Creating alt text is often a repetitive process:

1. Visit every page manually.
2. Capture screenshots.
3. Upload screenshots to an AI tool.
4. Copy the generated alt text.
5. Paste it back into the website.

For larger websites, this quickly becomes time-consuming.

SiteShot automates this workflow from start to finish, reducing manual effort and saving significant time.

## How It Works

1. Enter the website URL.
2. SiteShot crawls every page and captures screenshots automatically.
3. Screenshots are processed using Google Gemini to generate meaningful, UK-compatible alt text.
4. An HTML report is generated with screenshots and their corresponding alt text, organised page-wise and section-wise.
5. Click any description to copy it directly to your clipboard.

## Demo

https://www.awesomescreenshot.com/video/55127214?key=3896ac028df463a40854e4a65504096d

## Installation

Download the latest release:

https://github.com/anubhavbaghel/siteshot/releases

## Tech Stack

* Electron
* Playwright
* Node.js
* Google Gemini API
