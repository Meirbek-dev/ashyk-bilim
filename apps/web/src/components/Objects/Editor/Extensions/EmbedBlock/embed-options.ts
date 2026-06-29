/**
 * Embed provider registry for Ashyk Bilim LMS.
 *
 * Icon names reference named exports from `@icons-pack/react-simple-icons`.
 * Usage in a component:
 *
 *   import * as Si from '@icons-pack/react-simple-icons';
 *   const Icon = provider.iconName ? (Si as Record<string, React.ElementType>)[provider.iconName] : null;
 *   {Icon && <Icon size={16} />}
 */

export type EmbedCategoryId =
  | 'popular'
  | 'visual'
  | 'code'
  | 'media'
  | 'assessment'
  | 'productivity'
  | 'academic'
  | 'collaboration'

export interface EmbedCategory {
  id: EmbedCategoryId
  label: string
  description: string
}

export const EMBED_CATEGORIES: EmbedCategory[] = [
  { id: 'popular', label: 'popularLabel', description: 'popularDescription' },
  { id: 'visual', label: 'visualLabel', description: 'visualDescription' },
  { id: 'code', label: 'codeLabel', description: 'codeDescription' },
  { id: 'media', label: 'mediaLabel', description: 'mediaDescription' },
  {
    id: 'assessment',
    label: 'assessmentLabel',
    description: 'assessmentDescription',
  },
  {
    id: 'productivity',
    label: 'productivityLabel',
    description: 'productivityDescription',
  },
  { id: 'academic', label: 'academicLabel', description: 'academicDescription' },
  {
    id: 'collaboration',
    label: 'collaborationLabel',
    description: 'collaborationDescription',
  },
]

export interface EmbedProvider {
  type: string
  categories: readonly EmbedCategoryId[]
  placeholder: string
  hostnames: readonly string[]
  defaultHeight: number
  allow?: string
  requiresEmbedUrl?: boolean
  /** Named export from `@icons-pack/react-simple-icons`, e.g. `'SiYoutube'`. */
  iconName?: string
  exampleUrl?: string
  helpUrl?: string
}

export const EMBED_PROVIDERS = [
  // ─── VISUAL ──────────────────────────────────────────────────────────────────

  {
    type: 'figma',
    categories: ['visual', 'popular'],
    placeholder: 'https://www.figma.com/file/...',
    hostnames: ['figma.com', 'www.figma.com'],
    defaultHeight: 560,
    iconName: 'SiFigma',
    exampleUrl: 'https://www.figma.com/file/LKQ4gTR757PVMMsrr73g9g/UTK-Web-Design-System',
    helpUrl: 'https://help.figma.com/hc/en-us/articles/360039824474-Embed-files-and-prototypes',
  },
  {
    type: 'canva',
    categories: ['visual', 'popular'],
    placeholder: 'https://www.canva.com/design/...',
    hostnames: ['canva.com', 'www.canva.com'],
    defaultHeight: 560,
    iconName: 'SiCanva',
    exampleUrl: 'https://www.canva.com/design/DAF-x2Y2F2Q/view',
    helpUrl: 'https://www.canva.com/help/embed-designs/',
  },
  {
    type: 'miro',
    categories: ['visual'],
    placeholder: 'https://miro.com/app/board/...',
    hostnames: ['miro.com', 'www.miro.com'],
    defaultHeight: 560,
    iconName: 'SiMiro',
    exampleUrl: 'https://miro.com/app/board/uXjVP479xCE=/',
    helpUrl: 'https://help.miro.com/hc/en-us/articles/360016335640-Embed-boards-into-websites',
  },
  {
    type: 'excalidraw',
    categories: ['visual', 'popular'],
    placeholder: 'https://excalidraw.com/#room=...',
    hostnames: ['excalidraw.com'],
    defaultHeight: 520,
    iconName: 'SiExcalidraw',
    exampleUrl: 'https://excalidraw.com/#room=c62706dbb2ba05273be4,t7oFk_0X_Y12398457',
    helpUrl: 'https://plus.excalidraw.com/blog/how-to-embed',
  },
  {
    type: 'tldraw',
    categories: ['visual', 'popular'],
    placeholder: 'https://tldraw.com/r/room-id',
    hostnames: ['tldraw.com'],
    defaultHeight: 520,
    iconName: 'SiTldraw',
    exampleUrl: 'https://tldraw.com/r/lms_math_geometry_demo',
    helpUrl: 'https://tldraw.dev/',
  },
  {
    type: 'mural',
    categories: ['visual'],
    placeholder: 'https://app.mural.co/...',
    hostnames: ['mural.co', 'app.mural.co'],
    defaultHeight: 560,
    iconName: 'SiMural',
  },
  {
    type: 'spline',
    categories: ['visual'],
    placeholder: 'https://my.spline.design/...',
    hostnames: ['spline.design', 'my.spline.design'],
    defaultHeight: 560,
    iconName: 'SiSpline',
  },
  {
    type: 'lottiefiles',
    categories: ['visual'],
    placeholder: 'https://lottiefiles.com/...',
    hostnames: ['lottiefiles.com', 'www.lottiefiles.com'],
    defaultHeight: 420,
    iconName: 'SiLottiefiles',
  },
  {
    type: 'sketchpad',
    categories: ['visual'],
    placeholder: 'https://sketchpad.app/...',
    hostnames: ['sketchpad.app', 'www.sketchpad.app'],
    defaultHeight: 520,
  },
  // NEW ↓
  {
    type: 'prezi',
    categories: ['visual'],
    placeholder: 'https://prezi.com/view/...',
    hostnames: ['prezi.com'],
    defaultHeight: 560,
    iconName: 'SiPrezi',
  },
  {
    type: 'pitch',
    categories: ['visual'],
    placeholder: 'https://pitch.com/public/...',
    hostnames: ['pitch.com'],
    defaultHeight: 560,
    iconName: 'SiPitch',
  },
  {
    type: 'gamma',
    categories: ['visual'],
    placeholder: 'https://gamma.app/public/...',
    hostnames: ['gamma.app'],
    defaultHeight: 560,
    iconName: 'SiGamma',
  },
  {
    type: 'google-slides',
    categories: ['visual', 'popular'],
    placeholder: 'https://docs.google.com/presentation/d/.../edit',
    hostnames: ['docs.google.com'],
    defaultHeight: 560,
    iconName: 'SiGoogleslides',
    exampleUrl: 'https://docs.google.com/presentation/d/1yN_t3v8gJd4p7uFv_W8t45H7g9_K0E3S4f4u_8p7q-o/edit',
    helpUrl: 'https://support.google.com/docs/answer/37579',
  },
  {
    type: 'powerpoint',
    categories: ['visual', 'popular'],
    placeholder: 'https://onedrive.live.com/embed?resid=...',
    hostnames: ['office.com', 'microsoft.com', 'live.com'],
    defaultHeight: 560,
    iconName: 'SiMicrosoftpowerpoint',
  },
  {
    type: 'ms-whiteboard',
    categories: ['visual'],
    placeholder: 'https://whiteboard.office.com/me/whiteboards/...',
    hostnames: ['whiteboard.office.com', 'whiteboard.microsoft.com'],
    defaultHeight: 560,
    iconName: 'SiMicrosoft',
  },
  {
    type: 'explain-everything',
    categories: ['visual'],
    placeholder: 'https://explaineverything.com/board/...',
    hostnames: ['explaineverything.com'],
    defaultHeight: 560,
    iconName: 'SiExplaineverything',
  },
  {
    type: 'slides-com',
    categories: ['visual'],
    placeholder: 'https://slides.com/user/deck/embed',
    hostnames: ['slides.com'],
    defaultHeight: 560,
    requiresEmbedUrl: true,
    iconName: 'SiSlides',
  },

  // ─── CODE ────────────────────────────────────────────────────────────────────
  {
    type: 'jsfiddle',
    categories: ['code'],
    placeholder: 'https://jsfiddle.net/...',
    hostnames: ['jsfiddle.net'],
    defaultHeight: 460,
    requiresEmbedUrl: true,
    iconName: 'SiJsfiddle',
  },
  {
    type: 'codepen',
    categories: ['code', 'popular'],
    placeholder: 'https://codepen.io/user/pen/...',
    hostnames: ['codepen.io'],
    defaultHeight: 460,
    iconName: 'SiCodepen',
    exampleUrl: 'https://codepen.io/sdras/pen/gWWQGb',
    helpUrl: 'https://blog.codepen.io/documentation/features/embedded-pens/',
  },
  {
    type: 'replit',
    categories: ['code'],
    placeholder: 'https://replit.com/@user/repl-name',
    hostnames: ['replit.com'],
    defaultHeight: 560,
    iconName: 'SiReplit',
  },
  {
    type: 'stackblitz',
    categories: ['code'],
    placeholder: 'https://stackblitz.com/edit/...',
    hostnames: ['stackblitz.com'],
    defaultHeight: 560,
    iconName: 'SiStackblitz',
  },
  {
    type: 'github-gist',
    categories: ['code'],
    placeholder: 'https://gist.github.com/user/id',
    hostnames: ['gist.github.com'],
    defaultHeight: 420,
    iconName: 'SiGithub',
  },
  {
    type: 'glitch',
    categories: ['code'],
    placeholder: 'https://glitch.com/edit/#!/project',
    hostnames: ['glitch.com'],
    defaultHeight: 560,
    iconName: 'SiGlitch',
  },
  {
    type: 'codesnip',
    categories: ['code'],
    placeholder: 'https://codesnip.dev/...',
    hostnames: ['codesnip.dev', 'www.codesnip.dev'],
    defaultHeight: 460,
  },
  {
    type: 'codesandbox',
    categories: ['code'],
    placeholder: 'https://codesandbox.io/p/sandbox/...',
    hostnames: ['codesandbox.io'],
    defaultHeight: 560,
    iconName: 'SiCodesandbox',
  },
  // NEW ↓
  {
    type: 'observable',
    categories: ['code'],
    placeholder: 'https://observablehq.com/embed/@user/notebook',
    hostnames: ['observablehq.com'],
    defaultHeight: 520,
    requiresEmbedUrl: true,
    iconName: 'SiObservable',
  },
  {
    type: 'mybinder',
    categories: ['code'],
    placeholder: 'https://mybinder.org/v2/gh/user/repo/HEAD',
    hostnames: ['mybinder.org'],
    defaultHeight: 640,
    iconName: 'SiJupyter',
  },
  {
    type: 'kaggle',
    categories: ['code'],
    placeholder: 'https://www.kaggle.com/embed/user/notebook',
    hostnames: ['kaggle.com', 'www.kaggle.com'],
    defaultHeight: 560,
    requiresEmbedUrl: true,
    iconName: 'SiKaggle',
  },
  {
    type: 'huggingface',
    categories: ['code'],
    placeholder: 'https://huggingface.co/spaces/user/space',
    hostnames: ['huggingface.co'],
    defaultHeight: 640,
    iconName: 'SiHuggingface',
  },
  {
    type: 'wandb',
    categories: ['code'],
    placeholder: 'https://api.wandb.ai/links/user/report-id',
    hostnames: ['wandb.ai', 'api.wandb.ai'],
    defaultHeight: 560,
    iconName: 'SiWeightsandbiases',
  },
  {
    type: 'gitpod',
    categories: ['code'],
    placeholder: 'https://gitpod.io/#https://github.com/user/repo',
    hostnames: ['gitpod.io'],
    defaultHeight: 640,
    iconName: 'SiGitpod',
  },
  {
    type: 'google-colab',
    categories: ['code', 'popular'],
    placeholder: 'https://colab.research.google.com/drive/...',
    hostnames: ['colab.research.google.com'],
    defaultHeight: 560,
    iconName: 'SiGooglecolab',
  },

  // ─── MEDIA ───────────────────────────────────────────────────────────────────
  {
    type: 'youtube',
    categories: ['media'],
    placeholder: 'https://www.youtube.com/watch?v=...',
    hostnames: ['youtube.com', 'www.youtube.com', 'youtu.be'],
    defaultHeight: 420,
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    iconName: 'SiYoutube',
    exampleUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    helpUrl: 'https://support.google.com/youtube/answer/171780',
  },
  {
    type: 'vimeo',
    categories: ['media'],
    placeholder: 'https://vimeo.com/...',
    hostnames: ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'],
    defaultHeight: 420,
    allow: 'autoplay; fullscreen; picture-in-picture',
    iconName: 'SiVimeo',
  },
  {
    type: 'loom',
    categories: ['media'],
    placeholder: 'https://www.loom.com/share/...',
    hostnames: ['loom.com', 'www.loom.com'],
    defaultHeight: 420,
    iconName: 'SiLoom',
  },
  {
    type: 'google-vids',
    categories: ['media'],
    placeholder: 'https://vids.google.com/...',
    hostnames: ['vids.google.com', 'drive.google.com'],
    defaultHeight: 480,
    iconName: 'SiGoogle',
  },
  {
    type: 'wistia',
    categories: ['media'],
    placeholder: 'https://fast.wistia.net/embed/iframe/...',
    hostnames: ['wistia.com', 'fast.wistia.net'],
    defaultHeight: 420,
    iconName: 'SiWistia',
  },
  {
    type: 'spotify',
    categories: ['media'],
    placeholder: 'https://open.spotify.com/...',
    hostnames: ['open.spotify.com', 'spotify.com'],
    defaultHeight: 352,
    iconName: 'SiSpotify',
    exampleUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX10zKzsJ2jva',
    helpUrl: 'https://developer.spotify.com/documentation/widgets/guides/sharing-spotify-content/',
  },
  {
    type: 'soundcloud',
    categories: ['media'],
    placeholder: 'https://soundcloud.com/...',
    hostnames: ['soundcloud.com', 'w.soundcloud.com'],
    defaultHeight: 320,
    iconName: 'SiSoundcloud',
  },
  {
    type: 'suno',
    categories: ['media'],
    placeholder: 'https://suno.com/song/...',
    hostnames: ['suno.com', 'www.suno.com'],
    defaultHeight: 420,
    iconName: 'SiSuno',
  },
  {
    type: 'sodaphonic',
    categories: ['media'],
    placeholder: 'https://sodaphonic.com/...',
    hostnames: ['sodaphonic.com', 'www.sodaphonic.com'],
    defaultHeight: 520,
  },
  // NEW ↓
  {
    type: 'rutube',
    categories: ['media'],
    placeholder: 'https://rutube.ru/video/...',
    hostnames: ['rutube.ru'],
    defaultHeight: 420,
    allow: 'autoplay; fullscreen',
    iconName: 'SiRutube',
  },
  {
    type: 'vk-video',
    categories: ['media'],
    placeholder: 'https://vk.com/video-...',
    hostnames: ['vk.com', 'vkvideo.ru'],
    defaultHeight: 420,
    allow: 'autoplay; encrypted-media; fullscreen',
    iconName: 'SiVk',
  },
  {
    type: 'vk-clips',
    categories: ['media'],
    placeholder: 'https://vk.com/clip-...',
    hostnames: ['vk.com'],
    defaultHeight: 560,
    iconName: 'SiVk',
  },
  {
    type: 'ted',
    categories: ['media'],
    placeholder: 'https://www.ted.com/talks/...',
    hostnames: ['ted.com', 'www.ted.com', 'embed.ted.com'],
    defaultHeight: 480,
    allow: 'autoplay; fullscreen',
    requiresEmbedUrl: true,
    iconName: 'SiTed',
  },
  {
    type: 'deezer',
    categories: ['media'],
    placeholder: 'https://www.deezer.com/playlist/...',
    hostnames: ['deezer.com', 'www.deezer.com', 'widget.deezer.com'],
    defaultHeight: 350,
    requiresEmbedUrl: true,
    iconName: 'SiDeezer',
  },
  {
    type: 'mixcloud',
    categories: ['media'],
    placeholder: 'https://www.mixcloud.com/user/mix/',
    hostnames: ['mixcloud.com', 'www.mixcloud.com'],
    defaultHeight: 120,
    requiresEmbedUrl: true,
    iconName: 'SiMixcloud',
  },
  {
    type: 'panopto',
    categories: ['media'],
    placeholder: 'https://university.hosted.panopto.com/Panopto/Pages/Embed.aspx?id=...',
    hostnames: ['hosted.panopto.com', 'panopto.com'],
    defaultHeight: 480,
    allow: 'autoplay; fullscreen',
    requiresEmbedUrl: true,
    iconName: 'SiPanopto',
  },
  {
    type: 'kaltura',
    categories: ['media'],
    placeholder: 'https://cdnapisec.kaltura.com/p/partner-id/embedPlaykitJs/...',
    hostnames: ['kaltura.com', 'cdnapisec.kaltura.com'],
    defaultHeight: 480,
    allow: 'autoplay; fullscreen',
    requiresEmbedUrl: true,
    iconName: 'SiKaltura',
  },

  // ─── ASSESSMENT ──────────────────────────────────────────────────────────────
  {
    type: 'h5p',
    categories: ['assessment'],
    placeholder: 'https://h5p.org/h5p/embed/...',
    hostnames: ['h5p.org', 'h5p.com'],
    defaultHeight: 560,
    iconName: 'SiH5p',
  },
  {
    type: 'genially',
    categories: ['assessment'],
    placeholder: 'https://view.genially.com/...',
    hostnames: ['genially.com', 'view.genially.com'],
    defaultHeight: 560,
    iconName: 'SiGenially',
  },
  {
    type: 'typeform',
    categories: ['assessment'],
    placeholder: 'https://form.typeform.com/to/...',
    hostnames: ['typeform.com', 'form.typeform.com'],
    defaultHeight: 560,
    iconName: 'SiTypeform',
  },
  {
    type: 'jotform',
    categories: ['assessment'],
    placeholder: 'https://form.jotform.com/...',
    hostnames: ['jotform.com', 'form.jotform.com'],
    defaultHeight: 560,
    iconName: 'SiJotform',
  },
  {
    type: 'google-forms',
    categories: ['assessment', 'popular'],
    placeholder: 'https://docs.google.com/forms/d/e/...',
    hostnames: ['docs.google.com'],
    defaultHeight: 640,
    iconName: 'SiGoogleforms',
    exampleUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSf2_RUXS8yvK1q0M-5lE9g7U8M1_W3T6u-W5x6g7M3k8u8g/viewform',
    helpUrl: 'https://support.google.com/docs/answer/37579',
  },
  {
    type: 'tally',
    categories: ['assessment'],
    placeholder: 'https://tally.so/r/...',
    hostnames: ['tally.so'],
    defaultHeight: 560,
    iconName: 'SiTally',
  },
  {
    type: 'quizlet',
    categories: ['assessment'],
    placeholder: 'https://quizlet.com/...',
    hostnames: ['quizlet.com', 'www.quizlet.com'],
    defaultHeight: 500,
    iconName: 'SiQuizlet',
  },
  {
    type: 'kahoot',
    categories: ['assessment', 'popular'],
    placeholder: 'https://create.kahoot.it/share/...',
    hostnames: ['kahoot.it', 'create.kahoot.it'],
    defaultHeight: 500,
    iconName: 'SiKahoot',
  },
  {
    type: 'mentimeter',
    categories: ['assessment', 'popular'],
    placeholder: 'https://www.mentimeter.com/...',
    hostnames: ['mentimeter.com', 'www.mentimeter.com'],
    defaultHeight: 560,
    iconName: 'SiMentimeter',
  },
  // NEW ↓
  {
    type: 'blooket',
    categories: ['assessment'],
    placeholder: 'https://www.blooket.com/play/...',
    hostnames: ['blooket.com', 'www.blooket.com'],
    defaultHeight: 500,
  },
  {
    type: 'quizizz',
    categories: ['assessment'],
    placeholder: 'https://quizizz.com/admin/quiz/...',
    hostnames: ['quizizz.com'],
    defaultHeight: 500,
    iconName: 'SiQuizizz',
  },
  {
    type: 'edpuzzle',
    categories: ['assessment'],
    placeholder: 'https://edpuzzle.com/embed/media/...',
    hostnames: ['edpuzzle.com'],
    defaultHeight: 500,
  },
  {
    type: 'plickers',
    categories: ['assessment'],
    placeholder: 'https://www.plickers.com/...',
    hostnames: ['plickers.com', 'www.plickers.com'],
    defaultHeight: 500,
    iconName: 'SiPlickers',
  },
  {
    type: 'wooclap',
    categories: ['assessment'],
    placeholder: 'https://app.wooclap.com/events/EVENT/questions/0',
    hostnames: ['app.wooclap.com', 'wooclap.com'],
    defaultHeight: 560,
    requiresEmbedUrl: true,
  },
  {
    type: 'slido',
    categories: ['assessment'],
    placeholder: 'https://wall.sli.do/event/...',
    hostnames: ['sli.do', 'wall.sli.do', 'slido.com'],
    defaultHeight: 560,
    requiresEmbedUrl: true,
    iconName: 'SiSlido',
  },
  {
    type: 'nearpod',
    categories: ['assessment'],
    placeholder: 'https://nearpod.com/libraries/...',
    hostnames: ['nearpod.com'],
    defaultHeight: 580,
  },
  {
    type: 'wordwall',
    categories: ['assessment'],
    placeholder: 'https://wordwall.net/embed/...',
    hostnames: ['wordwall.net'],
    defaultHeight: 500,
    requiresEmbedUrl: true,
  },
  {
    type: 'poll-everywhere',
    categories: ['assessment'],
    placeholder: 'https://www.polleverywhere.com/multiple_choice_polls/...',
    hostnames: ['polleverywhere.com', 'www.polleverywhere.com'],
    defaultHeight: 480,
    requiresEmbedUrl: true,
    iconName: 'SiPolleverywhere',
  },

  // ─── PRODUCTIVITY ────────────────────────────────────────────────────────────
  {
    type: 'airtable',
    categories: ['productivity'],
    placeholder: 'https://airtable.com/embed/...',
    hostnames: ['airtable.com'],
    defaultHeight: 560,
    iconName: 'SiAirtable',
  },
  {
    type: 'google-sheets',
    categories: ['productivity', 'popular'],
    placeholder: 'https://docs.google.com/spreadsheets/d/...',
    hostnames: ['docs.google.com'],
    defaultHeight: 560,
    iconName: 'SiGooglesheets',
    exampleUrl: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvAHSDuXn22Z0dQ2n219yqTFS51M/edit',
    helpUrl: 'https://support.google.com/docs/answer/37579',
  },
  {
    type: 'trello',
    categories: ['productivity'],
    placeholder: 'https://trello.com/b/...',
    hostnames: ['trello.com'],
    defaultHeight: 560,
    iconName: 'SiTrello',
  },
  {
    type: 'notion',
    categories: ['productivity', 'popular'],
    placeholder: 'https://www.notion.so/...',
    hostnames: ['notion.so', 'www.notion.so'],
    defaultHeight: 560,
    iconName: 'SiNotion',
  },
  {
    type: 'coda',
    categories: ['productivity'],
    placeholder: 'https://coda.io/embed/...',
    hostnames: ['coda.io'],
    defaultHeight: 560,
    iconName: 'SiCoda',
  },
  {
    type: 'tableau',
    categories: ['productivity'],
    placeholder: 'https://public.tableau.com/views/...',
    hostnames: ['public.tableau.com', 'tableau.com'],
    defaultHeight: 640,
    iconName: 'SiTableau',
  },
  // NEW ↓
  {
    type: 'looker-studio',
    categories: ['productivity'],
    placeholder: 'https://lookerstudio.google.com/embed/reporting/...',
    hostnames: ['lookerstudio.google.com', 'datastudio.google.com'],
    defaultHeight: 640,
    requiresEmbedUrl: true,
    iconName: 'SiLooker',
  },
  {
    type: 'clickup',
    categories: ['productivity'],
    placeholder: 'https://app.clickup.com/...?embed=1',
    hostnames: ['app.clickup.com', 'clickup.com'],
    defaultHeight: 560,
    requiresEmbedUrl: true,
    iconName: 'SiClickup',
  },
  {
    type: 'wakelet',
    categories: ['productivity'],
    placeholder: 'https://wakelet.com/wake/...',
    hostnames: ['wakelet.com'],
    defaultHeight: 560,
    iconName: 'SiWakelet',
  },
  {
    type: 'datalens',
    categories: ['productivity'],
    placeholder: 'https://datalens.yandex.ru/embed/...',
    hostnames: ['datalens.yandex.ru', 'datalens.yandex.com'],
    defaultHeight: 560,
    iconName: 'SiYandex',
  },
  {
    type: 'google-docs',
    categories: ['productivity', 'popular'],
    placeholder: 'https://docs.google.com/document/d/.../edit',
    hostnames: ['docs.google.com'],
    defaultHeight: 640,
    iconName: 'SiGoogledocs',
    exampleUrl: 'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvAHSDuXn22Z0dQ2n219yqTFS51M/edit',
    helpUrl: 'https://support.google.com/docs/answer/37579',
  },

  // ─── ACADEMIC ────────────────────────────────────────────────────────────────
  {
    type: 'desmos',
    categories: ['academic'],
    placeholder: 'https://www.desmos.com/calculator/...',
    hostnames: ['desmos.com', 'www.desmos.com'],
    defaultHeight: 520,
    iconName: 'SiDesmos',
    exampleUrl: 'https://www.desmos.com/calculator/28v0s8h138',
    helpUrl: 'https://desmos.helpscoutdocs.com/article/30-sharing-graphs',
  },
  {
    type: 'geogebra',
    categories: ['academic'],
    placeholder: 'https://www.geogebra.org/m/...',
    hostnames: ['geogebra.org', 'www.geogebra.org'],
    defaultHeight: 560,
    iconName: 'SiGeogebra',
    exampleUrl: 'https://www.geogebra.org/m/xc7eq7zc',
    helpUrl: 'https://www.geogebra.org/manual/en/Embedding_GeoGebra_Applets',
  },
  {
    type: 'wolfram-alpha',
    categories: ['academic'],
    placeholder: 'https://www.wolframalpha.com/...',
    hostnames: ['wolframalpha.com', 'www.wolframalpha.com'],
    defaultHeight: 500,
    iconName: 'SiWolframalpha',
  },
  {
    type: 'phet',
    categories: ['academic'],
    placeholder: 'https://phet.colorado.edu/sims/html/...',
    hostnames: ['phet.colorado.edu'],
    defaultHeight: 620,
    iconName: 'SiPhet',
  },
  {
    type: 'sketchfab',
    categories: ['academic'],
    placeholder: 'https://sketchfab.com/3d-models/...',
    hostnames: ['sketchfab.com', 'www.sketchfab.com'],
    defaultHeight: 520,
    allow: 'autoplay; fullscreen; xr-spatial-tracking',
    iconName: 'SiSketchfab',
  },
  {
    type: 'texlyre',
    categories: ['academic'],
    placeholder: 'https://texlyre.com/...',
    hostnames: ['texlyre.com', 'www.texlyre.com'],
    defaultHeight: 500,
  },
  // NEW ↓
  {
    type: 'yandex-maps',
    categories: ['academic'],
    placeholder: 'https://yandex.ru/maps/...',
    hostnames: ['yandex.ru', 'yandex.com', 'maps.yandex.ru'],
    defaultHeight: 480,
    iconName: 'SiYandex',
  },
  {
    type: 'brilliant',
    categories: ['academic'],
    placeholder: 'https://brilliant.org/courses/...',
    hostnames: ['brilliant.org'],
    defaultHeight: 600,
    iconName: 'SiBrilliant',
  },
  {
    type: 'symbolab',
    categories: ['academic'],
    placeholder: 'https://www.symbolab.com/solver/...',
    hostnames: ['symbolab.com', 'www.symbolab.com'],
    defaultHeight: 600,
    iconName: 'SiSymbolab',
  },
  {
    type: 'stepik',
    categories: ['academic', 'popular'],
    placeholder: 'https://stepik.org/lesson/.../step/1?unit=...',
    hostnames: ['stepik.org'],
    defaultHeight: 600,
    requiresEmbedUrl: true,
    iconName: 'SiStepik',
  },
  {
    type: 'overleaf',
    categories: ['academic'],
    placeholder: 'https://www.overleaf.com/read/...',
    hostnames: ['overleaf.com', 'www.overleaf.com'],
    defaultHeight: 640,
    iconName: 'SiOverleaf',
  },
  {
    type: 'molview',
    categories: ['academic'],
    placeholder: 'https://embed.molview.org/v1/?smiles=...',
    hostnames: ['molview.org', 'embed.molview.org'],
    defaultHeight: 520,
    requiresEmbedUrl: true,
  },
  {
    type: 'google-maps',
    categories: ['academic'],
    placeholder: 'https://www.google.com/maps/embed?pb=...',
    hostnames: ['google.com', 'www.google.com', 'maps.google.com'],
    defaultHeight: 480,
    requiresEmbedUrl: true,
    iconName: 'SiGooglemaps',
  },
  {
    type: 'chemtube3d',
    categories: ['academic'],
    placeholder: 'https://www.chemtube3d.com/...',
    hostnames: ['chemtube3d.com', 'www.chemtube3d.com'],
    defaultHeight: 560,
  },

  // ─── COLLABORATION ────────────────────────────────────────────────────────────
  {
    type: 'notebooklm',
    categories: ['collaboration'],
    placeholder: 'https://notebooklm.google.com/...',
    hostnames: ['notebooklm.google.com'],
    defaultHeight: 560,
    iconName: 'SiGoogle',
  },
  {
    type: 'hyperbeam',
    categories: ['collaboration'],
    placeholder: 'https://hyperbeam.com/...',
    hostnames: ['hyperbeam.com', 'www.hyperbeam.com'],
    defaultHeight: 560,
  },
  {
    type: 'discord',
    categories: ['collaboration', 'popular'],
    placeholder: 'https://discord.com/invite/...',
    hostnames: ['discord.com', 'discord.gg'],
    defaultHeight: 420,
    iconName: 'SiDiscord',
  },
  // NEW ↓
  {
    type: 'telegram',
    categories: ['collaboration', 'popular'],
    placeholder: 'https://t.me/channel/123',
    hostnames: ['t.me'],
    defaultHeight: 400,
    iconName: 'SiTelegram',
  },
  {
    type: 'chatgpt',
    categories: ['collaboration', 'popular'],
    placeholder: 'https://chatgpt.com/share/...',
    hostnames: ['chatgpt.com', 'openai.com'],
    defaultHeight: 560,
    iconName: 'SiOpenai',
  },
  {
    type: 'padlet',
    categories: ['collaboration'],
    placeholder: 'https://padlet.com/user/board',
    hostnames: ['padlet.com'],
    defaultHeight: 560,
    iconName: 'SiPadlet',
  },
  {
    type: 'flip',
    categories: ['collaboration'],
    placeholder: 'https://flip.com/groups/...',
    hostnames: ['flip.com'],
    defaultHeight: 560,
    iconName: 'SiFlip',
  },
] as const satisfies readonly EmbedProvider[]

export type EmbedType = (typeof EMBED_PROVIDERS)[number]['type']

export const DEFAULT_EMBED_TYPE: EmbedType = 'youtube'

const PROVIDERS_BY_TYPE = new Map<EmbedType, EmbedProvider>(EMBED_PROVIDERS.map(provider => [provider.type, provider]))

export function getEmbedProvider(type: EmbedType | string | null | undefined): EmbedProvider | null {
  if (!type) return null
  return PROVIDERS_BY_TYPE.get(type as EmbedType) ?? null
}

export function isEmbedType(type: string | null | undefined): type is EmbedType {
  return Boolean(type && PROVIDERS_BY_TYPE.has(type as EmbedType))
}

/**
 * Returns providers filtered and sorted for a given category.
 * Providers without an `iconName` are sorted last so icon grids look clean.
 */
export function getProvidersByCategory(category: EmbedCategoryId): EmbedProvider[] {
  return (EMBED_PROVIDERS as readonly EmbedProvider[])
    .filter(p => p.categories.includes(category))
    .toSorted((a, b) => {
      if (a.iconName && !b.iconName) return -1
      if (!a.iconName && b.iconName) return 1
      return a.type.localeCompare(b.type)
    })
}

/**
 * Clamps a raw height value to the valid embed height range [200, 1200].
 */
export function clampEmbedHeight(raw: number): number {
  return Math.min(1200, Math.max(200, raw))
}
