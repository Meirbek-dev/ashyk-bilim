Building a dynamic Tiptap-based LMS is a great move—the flexibility of ProseMirror/Tiptap makes it the "Swiss Army Knife" of editors. To make your LMS truly interactive, you need to go beyond just text and images.

Here are **50 embed options** categorized by their utility in a learning environment.

### 🎨 Visual Design & Whiteboarding

1. **Excalidraw:** For hand-drawn style diagrams and brainstorming.
2. **tldraw:** A faster, more "infinite canvas" approach to drawing.
3. **Figma:** Embed live design files or prototypes for UI/UX courses.
4. **Canva:** Let instructors embed posters, infographics, or presentations.
5. **Miro:** The gold standard for collaborative workshops and mind mapping.
6. **Mural:** High-end visual collaboration for enterprise-level training.
7. **Spline:** For interactive **3D scenes** and objects.
8. **LottieFiles:** To add lightweight, high-quality animations.
9. **Sketchpad:** A simple, browser-based digital canvas for quick sketches.

### 💻 Interactive Coding & Tech

10. **JSFiddle:** Classic for quick HTML/CSS/JS snippets.
11. **CodePen:** Visually stunning front-end code demonstrations.
12. **Replit:** Full interactive IDEs that support nearly any programming language.
13. **StackBlitz:** Great for full-stack Node.js or React/Vue project embeds.
14. **GitHub Gists:** For clean, syntax-highlighted code snippets.
15. **Glitch:** Interactive "remixable" web apps.
16. **CodeSnip:** A modern, 2026-focused snippet sharing tool with AI explanations.
17. **CodeSandbox:** Powerful sandbox for showing complex front-end architectures.

### 🎥 Video, Audio & Multimedia

18. **YouTube:** The bread and butter of educational video.
19. **Vimeo:** For high-quality, ad-free video hosting.
20. **Loom:** Perfect for "talking head" style tutorial recordings.
21. **Google Vids:** The 2026 standard for AI-generated educational slide-videos.
22. **Wistia:** Video with built-in lead generation and tracking.
23. **Spotify:** For podcasts or curated study playlists.
24. **SoundCloud:** For music production courses or language listening exercises.
25. **Suno:** Embed AI-generated music/songs for creative assignments.
26. **Sodaphonic:** A browser-based audio editor for podcasting modules.

### 📝 Quizzes, Forms & Assessments

27. **H5P:** The king of interactive LMS content (quizzes, drag-and-drop, etc.).
28. **Genially:** Gamified presentations and interactive images.
29. **Typeform:** For high-engagement, beautiful surveys and entry/exit tickets.
30. **Jotform:** Complex forms with logic and payment integrations.
31. **Google Forms:** The standard for quick, data-driven quizzes.
32. **Tally.so:** A Notion-style form builder that feels native to the editor.
33. **Quizlet:** Flashcard sets and study games.
34. **Kahoot!:** Competitive, game-based live assessments.
35. **Mentimeter:** Real-time polling and word clouds for live sessions.

### 📊 Productivity & Data

36. **Airtable:** For database-driven lessons or project tracking.
37. **Google Sheets:** Live-updating data tables and charts.
38. **Trello:** For teaching project management or organizing course milestones.
39. **Notion:** Embed "wikis" or structured resource pages.
40. **Coda:** Interactive "docs that act like apps."
41. **Tableau:** High-end data visualization for analytics courses.

### 🧪 Academic & Science

42. **Desmos:** The best interactive graphing calculator for math.
43. **GeoGebra:** 3D math and geometry simulations.
44. **Wolfram Alpha:** Computational intelligence widgets.
45. **PhET Interactive Simulations:** Scientific simulations for physics, chemistry, and biology.
46. **Sketchfab:** Embed 3D models of historical artifacts or biological structures.
47. **TeXlyre:** A niche 2026 tool for live-rendering LaTeX and Typst math equations.

### 🤖 AI & Modern Collaboration

48. **NotebookLM:** Embed AI-grounded research environments for specific source material.
49. **Hyperbeam:** A shared "multiplayer browser" inside the editor for co-browsing.
50. **Discord:** Embed a server invite or a "Channel Chat" widget for community building.

---

### 💡 Implementation Tip

When building these in Tiptap, don't just use a generic `Iframe` node. Create a **Custom Node View**. This allows you to:

* **Placeholder Mode:** Show a static "Click to Load" preview so the editor doesn't lag with 50 iframes loading at once.
* **Resize Handles:** Let users scale the embeds directly in the editor.
* **SSR Friendly:** Ensure the HTML output just contains the iframe link, while the editor provides the interactive experience.
