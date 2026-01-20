import https from "https";
import fs from "fs";
import path from "path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import { log } from "./config/logger.js";
import { corsConfig } from "./config/cors.js";
import { ratelimit } from "./config/ratelimit.js";
import { execGracefulShutdown } from "./utils.js";
import { DeploymentEnv, env, SERVERLESS_ENVIRONMENTS } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./config/errorHandler.js";
import type { ServerContext } from "./config/context.js";

import { logging } from "./middleware/logging.js";
import { cacheConfigSetter, cacheControlHeaders } from "./middleware/cache.js";

// Import routes
import { hianimeRouter } from "./routes/hianime/index.js";
import { hindiDubbedRouter } from "./routes/animehindidubbed/index.js";
import { watchawRouter } from "./routes/watchanimeworld/index.js";
import { animeyaRouter } from "./routes/animeya/index.js";
import { animeRouter } from "./routes/anime/index.js";
import { animeApiRouter } from "./routes/anime-api/index.js";
import { animelokRouter } from "./routes/animelok/index.js";

import pkgJson from "../package.json" with { type: "json" };

// API version
const BASE_PATH = "/api/v1" as const;

const app = new Hono<ServerContext>();

// ========== MIDDLEWARE CHAIN ==========
app.use(logging);
app.use(corsConfig);
app.use(cacheControlHeaders);

// Rate limiting (enabled when API_HOSTNAME is set)
const isPersonalDeployment = Boolean(env.API_HOSTNAME);
if (isPersonalDeployment) {
    app.use(ratelimit);
}

// Static files
app.use("/", serveStatic({ root: "public" }));

// ========== HEALTH & INFO ENDPOINTS ==========
app.get("/health", (c) => c.text("daijoubu", { status: 200 }));

app.get("/version", (c) =>
    c.json({
        name: pkgJson.name,
        version: pkgJson.version,
        description: pkgJson.description,
    })
);

// ========== DYNAMIC DOCS ENDPOINT ==========
app.get(`${BASE_PATH}/docs/llm`, async (c) => {
    try {
        const docsDir = path.join(process.cwd(), "src", "docs");
        const files = ["intro.md", "hianime.md", "animeya.md", "sdk.md", "regional.md", "utility.md", "external.md"];
        let fullContent = "Tatakai API — FULL DOCUMENTATION\n\n";

        fullContent += "NOTE: This document concatenates all documentation files. Each file is delimited with BEGIN/END markers to help LLM consumption.\n\n";

        for (const file of files) {
            const content = fs.readFileSync(path.join(docsDir, file), "utf-8");
            fullContent += `\n=== BEGIN FILE: ${file} ===\n\n${content}\n\n=== END FILE: ${file} ===\n`;
        }

        return c.text(fullContent);
    } catch (error) {
        return c.text("Failed to generate LLM documentation", 500);
    }
});

app.get("/docs-content/:section", async (c) => {
    const section = c.req.param("section");
    // Secure filepath to prevent directory traversal
    const safeSections = ["intro", "hianime", "anikai", "animeya", "sdk", "regional", "utility", "external", "llm"];

    if (!safeSections.includes(section)) {
        return c.json({ error: "Invalid section" }, 404);
    }

    try {
        if (section === "llm") {
            // Generate LLM-friendly concatenated documentation
            const docsDir = path.join(process.cwd(), "src", "docs");
            const files = ["intro.md", "hianime.md", "anikai.md", "animeya.md", "sdk.md", "regional.md", "utility.md", "external.md"];
            let fullContent = "Tatakai API — FULL DOCUMENTATION\n\n";

            fullContent += "NOTE: This document concatenates all documentation files. Each file is delimited with BEGIN/END markers to help LLM consumption.\n\n";

            for (const file of files) {
                const content = fs.readFileSync(path.join(docsDir, file), "utf-8");
                fullContent += `\n=== BEGIN FILE: ${file} ===\n\n${content}\n\n=== END FILE: ${file} ===\n`;
            }

            return c.json({ content: fullContent });
        } else {
            console.log(`[DEBUG] Loading docs section: ${section}`);
            const filePath = path.join(process.cwd(), "src", "docs", `${section}.md`);
            console.log(`[DEBUG] File path: ${filePath}`);
            const content = fs.readFileSync(filePath, "utf-8");
            return c.json({ content });
        }
    } catch (error) {
        console.error(`[DEBUG] Failed to load docs: ${error}`);
        log.error(`Failed to load docs section ${section}: ${error}`);
        return c.json({ error: "Documentation not found" }, 404);
    }
});

app.get("/docs/:section?", (c) => {
    const sectionParam = c.req.param("section") || "intro";
    return c.html(`
        <!DOCTYPE html>
        <html lang="en" class="scroll-smooth">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Tatakai API | Developer Documentation</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/tokyo-night-dark.min.css">
    <script>
    tailwind.config={
        theme: {
            extend: {
                fontFamily: {
                    sans: ['Outfit', 'sans-serif'],
                    mono: ['JetBrains Mono', 'monospace'],
                },
            }
        }
    }
    </script>
    <style>
                :root {
                    --brand-color: #0ea5e9;
                    --bg-main: #050505;
                    --bg-alt: #0a0a0a;
                    --zinc-400: #a1a1aa;
                    --zinc-800: #27272a;
                    --zinc-900: #18181b;
                    --scrollbar-track: #09090b;
                    --scrollbar-thumb: #27272a;
                    --scrollbar-thumb-hover: #3f3f46;
                }

                /* Scrollbar Styling */
                ::-webkit-scrollbar { width: 8px; height: 8px; }
                ::-webkit-scrollbar-track { background: var(--scrollbar-track); }
                ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }

                body { background-color: var(--bg-main); color: #e4e4e7; font-family: 'Outfit', sans-serif; }
                
                .markdown-body h1 { font-size: 2.25rem; font-weight: 800; margin-bottom: 2rem; color: white; letter-spacing: -0.025em; }
                .markdown-body h2 { font-size: 1.5rem; font-weight: 700; margin-top: 4rem; margin-bottom: 1.5rem; color: white; border-bottom: 1px solid rgba(39, 39, 42, 0.5); padding-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; scroll-margin-top: 100px; }
                .markdown-body h3 { font-size: 1.25rem; font-weight: 700; margin-top: 2.5rem; margin-bottom: 1rem; color: #f4f4f5; scroll-margin-top: 100px; }
                .markdown-body p { color: var(--zinc-400); margin-bottom: 1.5rem; line-height: 1.625; font-size: 0.95rem; }
                .markdown-body ul { list-style-type: disc; list-style-position: inside; margin-bottom: 1.5rem; color: var(--zinc-400); padding-left: 1rem; }
                .markdown-body li { margin-bottom: 0.5rem; }
                .markdown-body code:not(pre code) { background-color: var(--zinc-900); border: 1px solid var(--zinc-800); color: var(--brand-color); padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-weight: 500; font-size: 0.85em; }
                .markdown-body pre { position: relative; background-color: var(--bg-alt); border: 1px solid rgba(39, 39, 42, 0.5); border-radius: 0.75rem; padding: 1.25rem; margin: 2rem 0; overflow-x: auto; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px); }
                .markdown-body pre code { background: transparent; padding: 0; border: none; font-size: 0.85em; line-height: 1.625; display: block; font-family: 'JetBrains Mono', monospace; }
                .markdown-body table { width: 100%; border-collapse: collapse; margin-bottom: 2.5rem; font-size: 0.875rem; border-radius: 0.5rem; overflow: hidden; }
                .markdown-body th { text-align: left; border-bottom: 1px solid var(--zinc-800); padding: 1rem; font-weight: 600; color: #e4e4e7; background-color: rgba(24, 24, 27, 0.5); }
                .markdown-body td { border-bottom: 1px solid var(--zinc-900); padding: 1rem; color: var(--zinc-400); }
                .markdown-body hr { border: 0; border-top: 1px solid var(--zinc-800); margin: 3rem 0; opacity: 0.3; }
                
                .sidebar-link.active { background: linear-gradient(90deg, rgba(14, 165, 233, 0.1) 0%, transparent 100%); border-left: 2px solid var(--brand-color); color: white; box-shadow: 0 0 20px rgba(14, 165, 233, 0.05); }
                .toc-link.active { color: var(--brand-color); border-left: 2px solid var(--brand-color); padding-left: 0.75rem; margin-left: -1px; }

                .btn-try { padding: 0.375rem 0.75rem; background-color: rgba(14, 165, 233, 0.1); border: 1px solid rgba(14, 165, 233, 0.5); color: var(--brand-color); border-radius: 0.5rem; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s; cursor: pointer; }
                .btn-try:hover { background-color: var(--brand-color); color: white; }
                .btn-try:active { transform: scale(0.95); }

                /* Custom Scrollbar */
                :: -webkit-scrollbar { width: 5px; }
                :: -webkit-scrollbar-track { background: var(--bg-main); }
                :: -webkit-scrollbar-thumb { background: #1f1f23; border-radius: 10px; }
                :: -webkit-scrollbar-thumb:hover { background: #27272a; }

                .copy-btn {
    position: absolute; top: 0.75rem; right: 0.75rem; background-color: rgba(24, 24, 27, 0.8); border: 1px solid var(--zinc-800); color: #71717a; font-size: 0.75rem; padding: 0.375rem 0.5rem; border-radius: 0.375rem; transition: all 0.2s; opacity: 0; backdrop-filter: blur(8px); cursor: pointer;
}
                .group:hover.copy-btn { opacity: 1; }
                .copy-btn:hover { color: white; border-color: #3f3f46; }

@keyframes slide -in { from { transform: translateX(-100 %); } to { transform: translateX(0); } }
                .mobile-nav-enter { animation: slide -in 0.3s cubic - bezier(0.16, 1, 0.3, 1); }
</style>
    </head>
    <body class="antialiased overflow-hidden flex h-screen font-sans selection:bg-brand-500/30 selection:text-brand-400">

        <!--Mobile Menu Overlay-->
            <div id="mobileOverlay" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] hidden transition-opacity duration-300"> </div>

                <!--Sidebar(Desktop & Mobile) -->
                    <aside id="sidebar" class="fixed inset-y-0 left-0 w-72 border-r border-zinc-800 flex flex-col bg-[#050505] z-[100] lg:relative lg:translate-x-0 -translate-x-full transition-transform duration-300 lg:transition-none">
                        <div class="p-6 border-b border-zinc-800 flex items-center justify-between">
                            <a href="/" class="flex items-center gap-2 group whitespace-nowrap">
                                <div class="w-8 h-8 bg-gradient-to-tr from-brand-400 to-purple-500 rounded-lg flex items-center justify-center text-black font-bold transform transition-transform group-hover:rotate-6">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                                </div>
                                <span class="font-bold text-lg tracking-tight">Tatakai<span class="text-zinc-600 font-normal ml-0.5 uppercase text-xs">API</span></span>
                            </a>
                            <button onclick="toggleMobileNav()" class="lg:hidden p-2 text-zinc-500 hover:text-white">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="M18 6 6 18M6 6l12 12" /> </svg>
                                                    </button>
                                                    </div>

                                                    <div class="p-4 border-b border-zinc-800/10">
                                                        <div class="relative group">
                                                            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-brand-400 transition-colors" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <circle cx="11" cy="11" r="8" /> <path d="m21 21-4.3-4.3" /> </svg>
                                                                <input type="text" id="searchInput" placeholder="Jump to..."
class="w-full bg-zinc-900/50 border border-zinc-800 text-sm pl-9 pr-4 py-2 rounded-xl focus:outline-none focus:border-brand-500/50 focus:bg-zinc-900 transition-all placeholder:text-zinc-600">
    </div>
    </div>

    <nav class="flex-1 overflow-y-auto py-6 px-4 space-y-1" id="navLinks">
        <div class="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-bold px-3 mb-3 mt-1"> Foundations </div>
            <button onclick="loadSection('intro')" class="sidebar-link w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200 transition-all flex items-center gap-3">
                <svg class="w-4 h-4 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /> <polyline points="9 22 9 12 15 12 15 22" /> </svg>
Introduction
    </button>

    <div class="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-bold px-3 mb-3 mt-8"> Endpoints </div>
        <button onclick="loadSection('hianime')" class="sidebar-link w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200 transition-all flex items-center gap-3">
            <svg class="w-4 h-4 text-blue-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /> </svg>
HiAnime
    </button>
    <button onclick="loadSection('anikai')" class="sidebar-link w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200 transition-all flex items-center gap-3">
        <svg class="w-4 h-4 text-purple-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /> <polyline points="3.27 6.96 12 12.01 20.73 6.96" /> <line x1="12" y1="22.08" x2="12" y2="12" /> </svg>
Anikai
    </button>
    <button onclick="loadSection('animeya')" class="sidebar-link w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200 transition-all flex items-center gap-3">
        <svg class="w-4 h-4 text-yellow-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /> </svg>
Animeya
    </button>
    <button onclick="loadSection('regional')" class="sidebar-link w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200 transition-all flex items-center gap-3">
        <svg class="w-4 h-4 text-green-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <circle cx="12" cy="12" r="10" /> <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /> <path d="M2 12h20" /> </svg>
Regional
    </button>
    <button onclick="loadSection('external')" class="sidebar-link w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200 transition-all flex items-center gap-3">
        <svg class="w-4 h-4 text-orange-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /> <polyline points="15 3 21 3 21 9" /> <line x1="10" y1="14" x2="21" y2="3" /> </svg>
External
    </button>
    <button onclick="loadSection('utility')" class="sidebar-link w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200 transition-all flex items-center gap-3">
        <svg class="w-4 h-4 text-pink-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a2 2 0 0 1-2.83-2.83l-3.94 3.6z" /> <path d="m14.7 6.3 5.3-5.3" /> <path d="M3.5 14.4c.1-.1.2-.2.3-.3l3-3.1a1 1 0 1 1 1.4 1.4l-3.3 3.4c-.6.6-.9 1.4-.9 2.2 0 1.8 1.4 3.2 3.2 3.2.8 0 1.6-.3 2.2-.9l3.4-3.3a1 1 0 1 1 1.4 1.4l-3.1 3c-.1.1-.2.2-.3.3A5.5 5.5 0 0 1 3.5 14.4z" /> <path d="m10.5 13.5 3 3" /> </svg>
Utility
    </button>

    <div class="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-bold px-3 mb-3 mt-8"> Resources </div>
        <button onclick="loadSection('sdk')" class="sidebar-link w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200 transition-all flex items-center gap-3">
            <svg class="w-4 h-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="M20 7h-9l-3-3H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2z" /> <path d="M12 11v6" /> <path d="M9 14h6" /> </svg>
                        NPM SDK
    </button>
    <button onclick="loadSection('llm')" class="sidebar-link w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 border border-transparent hover:bg-zinc-900 hover:text-zinc-200 transition-all flex items-center gap-3">
        <svg class="w-4 h-4 text-red-400/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /> </svg>
LLM Context
    </button>
    </nav>

    <div class="p-5 border-t border-zinc-900 bg-[#050505]">
        <a href="/" class="flex items-center justify-center gap-2 w-full py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-all">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="m11 17-5-5 5-5" /> <path d="M18 17V7" /> <polyline points="6 12 18 12" /> </svg>
                        Home Page
    </a>
    </div>
    </aside>

    <!--Main Scroll Area-->
        <div class="flex-1 flex flex-col min-w-0 bg-[#050505] overflow-hidden">

            <!--Mobile Sticky Header-->
                <header class="lg:hidden h-14 border-b border-zinc-800 bg-black/50 backdrop-blur-xl flex items-center px-4 justify-between z-50">
                    <button onclick="toggleMobileNav()" class="p-2 text-zinc-400">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <line x1="3" y1="12" x2="21" y2="12" /> <line x1="3" y1="6" x2="21" y2="6" /> <line x1="3" y1="18" x2="21" y2="18" /> </svg>
                            </button>
                            <span class="font-bold text-sm tracking-tight"> Tatakai Docs </span>
                                <div class="w-10"> </div>
                                    </header>

                                    <main class="flex-1 flex overflow-hidden">
                                        <!--Content Area-->
                                            <div class="flex-1 overflow-y-auto scroll-smooth relative" id="scrollContainer">

                                                <!--Breadcrumbs -->
                                                    <div class="sticky top-0 z-40 bg-[#050505]/80 backdrop-blur-md border-b border-white/5 px-8 h-12 flex items-center gap-2 text-xs text-zinc-500 overflow-hidden hidden lg:flex">
                                                        <span class="hover:text-zinc-300 pointer-events-none"> Docs </span>
                                                            <svg class="w-3 h-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="m9 18 6-6-6-6" /> </svg>
                                                                <span id="breadcrumbCurrent" class="text-zinc-200 font-medium"> Introduction </span>
                                                                    </div>

                                                                    <!--Content Glow-->
                                                                        <div class="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-500/5 rounded-full blur-[120px] pointer-events-none opacity-50"> </div>

                                                                            <div class="max-w-4xl mx-auto px-6 py-12 lg:px-12 lg:py-16 relative z-10 min-h-screen">
                                                                                <article id="content" class="markdown-body transition-opacity duration-300">
                                                                                    <div class="flex items-center justify-center h-64">
                                                                                        <div class="flex flex-col items-center gap-4">
                                                                                            <div class="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"> </div>
                                                                                                <span class="text-xs text-zinc-600 font-mono italic"> synchronizing context...</span>
                                                                                                    </div>
                                                                                                    </div>
                                                                                                    </article>

                                                                                                    <!--Bottom Nav-->
                                                                                                        <div class="mt-20 pt-10 border-t border-zinc-900 flex justify-between gap-4 overflow-hidden">
                                                                                                            <button id="prevBtn" class="flex flex-col items-start p-4 border border-zinc-900 rounded-xl hover:border-zinc-700 transition-colors w-1/2 group">
                                                                                                                <span class="text-[10px] text-zinc-600 uppercase font-bold mb-1"> Previous </span>
                                                                                                                    <span class="text-sm font-semibold group-hover:text-brand-400 flex items-center gap-2">
                                        & larr; <span id="prevText"> Introduction </span>
    </span>
    </button>
    <button id="nextBtn" class="flex flex-col items-end p-4 border border-zinc-900 rounded-xl hover:border-zinc-700 transition-colors w-1/2 group">
        <span class="text-[10px] text-zinc-600 uppercase font-bold mb-1 text-right"> Next </span>
            <span class="text-sm font-semibold group-hover:text-brand-400 flex items-center gap-2">
                <span id="nextText"> HiAnime </span> &rarr;
</span>
    </button>
    </div>
    </div>
    </div>

    <!--Right Sidebar(ToC)-->
        <aside class="hidden xl:flex w-64 border-l border-zinc-800 flex-col p-8 sticky top-0 h-screen overflow-y-auto">
            <div class="text-xs font-bold text-zinc-100 uppercase tracking-widest mb-6 border-b border-zinc-900 pb-2"> On this page </div>
                <nav id="toc" class="space-y-4">
                    <!--Populated by JS-->
                        </nav>

                        <div class="mt-12 space-y-4">
                            <div class="text-[10px] uppercase font-bold text-zinc-600 tracking-wider"> Community </div>
                                <a href="https://github.com/Snozxyx/TatakaAPI" class="flex items-center gap-2 text-xs text-zinc-500 hover:text-white transition-colors">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"> </path></svg>
                                        GitHub Repository
                                            </a>
                                            </div>
                                            </aside>
                                            </main>
                                            </div>

                                            <!--Toast Notification-->
                                                <div id="toast" class="fixed bottom-8 right-8 bg-zinc-900 border border-zinc-800 px-4 py-3 rounded-2xl text-xs text-white shadow-2xl translate-y-20 transition-transform opacity-0 pointer-events-none z-[200] flex items-center gap-3">
                                                    <div class="w-6 h-6 bg-green-500/10 text-green-400 rounded-full flex items-center justify-center">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"> <polyline points="20 6 9 17 4 12" /> </svg>
                                                            </div>
                                                            <span> Copied to clipboard </span>
                                                                </div>

                                                                <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"> </script>
                                                                    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"> </script>
                                                                        <script>
// Navigation Logic
const sections=['intro', 'hianime', 'anikai', 'animeya', 'regional', 'external', 'utility', 'sdk'];
let currentSection='${sectionParam}';

const searchInput=document.getElementById('searchInput');
const navButtons=document.querySelectorAll('.sidebar-link');
const contentDiv=document.getElementById('content');
const sidebar=document.getElementById('sidebar');
const mobileOverlay=document.getElementById('mobileOverlay');
const scrollContainer=document.getElementById('scrollContainer');

function toggleMobileNav() {
    sidebar.classList.toggle('-translate-x-full');
    mobileOverlay.classList.toggle('hidden');
}

mobileOverlay.onclick=toggleMobileNav;

window.addEventListener('load', () => {
    loadSection(currentSection);
});

searchInput.addEventListener('input', (e) => {
    const term=e.target.value.toLowerCase();
    navButtons.forEach(btn => {
        const text=btn.innerText.toLowerCase();
        btn.style.display=text.includes(term) ? 'flex' : 'none';
    });
});

async function loadSection(section) {
    currentSection=section;
    if (window.innerWidth <1024) {
        try { sidebar.classList.add('-translate-x-full'); mobileOverlay.classList.add('hidden'); } catch (e) { }
    }

    // Update Active State
    navButtons.forEach(btn => btn.classList.remove('active'));
    const activeBtn=Array.from(navButtons).find(btn => btn.innerText.toLowerCase().includes(section));
    if (activeBtn) activeBtn.classList.add('active');

    // Breadcrumb (placeholder for now)
    const breadcrumb=document.getElementById('breadcrumbCurrent');
    if (breadcrumb) breadcrumb.innerText=activeBtn ? activeBtn.innerText.trim() : section;

    contentDiv.style.opacity='0';
    setTimeout(async () => {
        try {
            console.log("Loading section:", section);
            const res = await fetch(\`/docs-content/\${section}\`);
            if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
            const data = await res.json();
            
            if (data.content) {
                contentDiv.innerHTML = marked.parse(data.content);
                hljs.highlightAll();
                wrapCodeBlocks();
                injectInteractiveElements();
                if (typeof generateTOC === 'function') generateTOC();
                contentDiv.style.opacity = '1';
                scrollContainer.scrollTop = 0;
                if (typeof updateNextPrev === 'function') updateNextPrev();
            } else {
                throw new Error("No content found");
            }
        } catch (e) {
            console.error("Docs load error:", e);
            contentDiv.innerHTML = \`<div class="flex flex-col items-center justify-center p-8 text-center"><div class="text-red-400 font-bold mb-2">Error loading documentation</div><div class="text-xs text-zinc-500 font-mono">\${e.message}</div><button onclick="location.reload()" class="mt-4 text-xs bg-zinc-800 px-3 py-1.5 rounded hover:bg-zinc-700">Retry</button></div>\`;
            contentDiv.style.opacity = '1';
        }
    }, 150);
                }

                function wrapCodeBlocks() {
                    document.querySelectorAll('pre code').forEach((block) => {
                        const pre=block.parentElement;
                        pre.classList.add('group');
                        
                        // Prevent duplicate buttons
                        if (pre.querySelector('.copy-btn')) return;

                        const button=document.createElement('button');
                        button.className='copy-btn font-sans';
                        button.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
                        
                        button.addEventListener('click', () => {
                            navigator.clipboard.writeText(block.innerText).then(() => {
                                if(typeof showToast === 'function') showToast();
                                button.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500"><polyline points="20 6 9 17 4 12"/></svg>';
                                setTimeout(() => {
                                    button.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
                                }, 2000);
                            });
                        });
                        
                        pre.appendChild(button);
                    });
                }

                function injectInteractiveElements() {
                    // Find all "Test Module" paragraphs
                    const paragraphs=Array.from(contentDiv.querySelectorAll('p'));
                    paragraphs.forEach(p => {
                        if (p.innerText.includes('Test Module') || p.innerText.includes('🔍 Test Module')) {
                            // Find the next code block
                            const nextPre=p.nextElementSibling;
                            if (nextPre && nextPre.tagName === 'PRE') {
                                const code=nextPre.innerText;
                                if (code.includes('curl')) {
                                    const btnContainer=document.createElement('div');
                                    btnContainer.className='flex gap-2 my-2';
                                    
                                    const tryBtn=document.createElement('button');
                                    tryBtn.className='btn-try';
                                    tryBtn.innerHTML='⚡ Try it';
                                    tryBtn.onclick=() => {
                                        // Extract URL from curl command
                                        const match=code.match(/"(http.*?)"/);
                                        if (match) window.open(match[1], '_blank');
                                    };
                                    
                                    const copyBtn=document.createElement('button');
                                    copyBtn.className='btn-try';
                                    copyBtn.innerHTML='📋 Copy Curl';
                                    copyBtn.onclick=() => {
                                        navigator.clipboard.writeText(code);
                                        showToast();
                                    };
                                    
                                    btnContainer.appendChild(tryBtn);
                                    btnContainer.appendChild(copyBtn);
                                    p.innerHTML=p.innerHTML.replace('Test Module', '<span class="font-bold text-zinc-300">Test Module</span>');
                                    p.after(btnContainer);
                                }
                            }
                        }
                    });
                }

                function showToast() {
                    const toast=document.getElementById('toast');
                    if(!toast) return;
                    toast.classList.remove('translate-y-20', 'opacity-0');
                    setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3000);
                }

                function generateTOC() {
                    const toc=document.getElementById('toc');
                    if(!toc) return;
                    toc.innerHTML='';
                    const headers=contentDiv.querySelectorAll('h2, h3');
                    
                    if(headers.length === 0) {
                        toc.innerHTML='<span class="text-xs text-zinc-600 italic">No headers found.</span>';
                        return;
                    }

                    headers.forEach((header, index) => {
                        const id=\`heading-\${index}\`;
                        header.id=id;
                        
                        const link=document.createElement('a');
                        link.href=\`#\${id}\`;
                        link.innerText=header.innerText;
                        link.className=\`toc-link block text-xs transition-all pointer-events-auto \${header.tagName === 'H3' ? 'pl-4 text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 font-medium hover:text-white'}\`;
                        
                        toc.appendChild(link);
                    });

                    // Add scroll observer
                    const observerOptions={
                        root: scrollContainer,
                        rootMargin: '-20% 0px -70% 0px',
                        threshold: 0
                    };

                    const observer=new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                document.querySelectorAll('.toc-link').forEach(l => l.classList.remove('active'));
                                const activeLink=document.querySelector(\`a[href="#\${entry.target.id}"]\`);
                                if(activeLink) activeLink.classList.add('active');
                            }
                        });
                    }, observerOptions);

                    headers.forEach(h => observer.observe(h));
                }

                function updateNextPrev() {
                    const index=sections.indexOf(currentSection);
                    const prev=sections[index - 1];
                    const next=sections[index + 1];

                    const prevBtn=document.getElementById('prevBtn');
                    const nextBtn=document.getElementById('nextBtn');
                    if(!prevBtn || !nextBtn) return;

                    if(prev) {
                        prevBtn.style.display='flex';
                        const text=document.getElementById('prevText');
                        if(text) text.innerText=prev.charAt(0).toUpperCase() + prev.slice(1);
                        prevBtn.onclick=() => loadSection(prev);
                    } else {
                        prevBtn.style.display='none';
                    }

                    if(next) {
                        nextBtn.style.display='flex';
                        const text=document.getElementById('nextText');
                        if(text) text.innerText=next.charAt(0).toUpperCase() + next.slice(1);
                        nextBtn.onclick=() => loadSection(next);
                    } else {
                        nextBtn.style.display='none';
                    }
                }

                // Initial Load
                document.addEventListener('DOMContentLoaded', () => loadSection('intro'));
            </script>
        </body>
        </html>
    `);
});

app.get("/", (c) =>
    c.json({
        status: 200,
        provider: "Tatakai",
        message: "🎌 Welcome to Tatakai API!",
        version: pkgJson.version,
        endpoints: {
            hianime: `${BASE_PATH}/hianime`,
            consumet: `${BASE_PATH}/consumet`,
            regional: {
                hindiDubbed: `${BASE_PATH}/hindidubbed`,
                animelok: `${BASE_PATH}/animelok`,
                watchaw: `${BASE_PATH}/watchaw`,
            },
            meta: `${BASE_PATH}/anime-api`,
            docs: "/docs"
        }
    })
);

// ========== CACHE CONFIG MIDDLEWARE ==========
app.use(cacheConfigSetter(BASE_PATH.length));

// ========== API ROUTES ==========
app.route(`${BASE_PATH}/hianime`, hianimeRouter);
app.route(`${BASE_PATH}/hindidubbed`, hindiDubbedRouter);
app.route(`${BASE_PATH}/watchaw`, watchawRouter);
app.route(`${BASE_PATH}/animeya`, animeyaRouter);
app.route(`${BASE_PATH}/anime`, animeRouter);
app.route(`${BASE_PATH}/anime-api`, animeApiRouter);
app.route(`${BASE_PATH}/animelok`, animelokRouter);

// ========== ERROR HANDLING ==========
app.notFound(notFoundHandler);
app.onError(errorHandler);

// ========== SERVER STARTUP ==========
(function () {
    // Skip server start for serverless environments
    if (SERVERLESS_ENVIRONMENTS.includes(env.DEPLOYMENT_ENV as typeof SERVERLESS_ENVIRONMENTS[number])) {
        return;
    }

    const serverPort = env.PORT;
    const serverInstance = serve({
        port: serverPort,
        fetch: app.fetch,
    }).addListener("listening", () => {
        log.info(`🎌 Tatakai API running at http://localhost:${serverPort}`);
        log.info(`📚 API Base Path: ${BASE_PATH}`);
        log.info(`🔧 Environment: ${env.NODE_ENV}`);
        log.info(`💾 Cache TTL: ${env.CACHE_TTL_SECONDS}s`);

        if (env.REDIS_URL) {
            log.info("📡 Redis: Connected");
        } else {
            log.info("📡 Cache: In-memory (LRU)");
        }

        if (isPersonalDeployment) {
            log.info(`🚦 Rate Limiting: ${env.RATE_LIMIT_MAX_REQUESTS} req/${env.RATE_LIMIT_WINDOW_MS / 1000}s`);
        }
    });

    // Graceful shutdown handlers
    process.on("SIGINT", () => execGracefulShutdown(serverInstance));
    process.on("SIGTERM", () => execGracefulShutdown(serverInstance));
    process.on("uncaughtException", (err) => {
        log.error(`Uncaught Exception: ${err.message}`);
        execGracefulShutdown(serverInstance);
    });
    process.on("unhandledRejection", (reason, promise) => {
        log.error(
            `Unhandled Rejection at: ${promise}, reason: ${reason instanceof Error ? reason.message : reason}`
        );
        execGracefulShutdown(serverInstance);
    });

    // Health check for Render free tier (prevents sleep)
    if (
        isPersonalDeployment &&
        env.DEPLOYMENT_ENV === DeploymentEnv.RENDER
    ) {
        const INTERVAL_DELAY = 8 * 60 * 1000; // 8 minutes
        const url = new URL(`https://${env.API_HOSTNAME}/health`);

        setInterval(() => {
            https
                .get(url.href)
                .on("response", () => {
                    log.info(`Health check at ${new Date().toISOString()}`);
                })
                .on("error", (err) =>
                    log.warn(`Health check failed: ${err.message.trim()}`)
                );
        }, INTERVAL_DELAY);
    }
})();

export default app;
