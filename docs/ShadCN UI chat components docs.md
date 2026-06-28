---
title: Attachment
description: Displays a file or image attachment with media, metadata, upload state, and actions.
base: base
component: true
---

<ComponentPreview
  styleName="base-rhea"
  name="attachment-demo"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background"
/>

The `Attachment` component displays a file or image attachment, its media, name, and metadata, with optional actions and upload state. Use it for files and images in chat composers, message threads, and upload lists.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
npx shadcn@latest add attachment
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Install the required shadcn/ui dependencies:</Step>

```bash
npx shadcn@latest add button
```

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource
  name="attachment"
  title="components/ui/attachment.tsx"
  styleName="base-rhea"
/>

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```tsx
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment'
```

```tsx
<Attachment>
  <AttachmentMedia>
    <FileTextIcon />
  </AttachmentMedia>
  <AttachmentContent>
    <AttachmentTitle>sales-dashboard.pdf</AttachmentTitle>
    <AttachmentDescription>PDF · 2.4 MB</AttachmentDescription>
  </AttachmentContent>
  <AttachmentActions>
    <AttachmentAction aria-label="Remove sales-dashboard.pdf">
      <XIcon />
    </AttachmentAction>
  </AttachmentActions>
</Attachment>
```

## Composition

Use the following composition to build an attachment:

```text
Attachment
├── AttachmentMedia
├── AttachmentContent
│   ├── AttachmentTitle
│   └── AttachmentDescription
├── AttachmentActions
│   └── AttachmentAction
└── AttachmentTrigger
```

Use `AttachmentGroup` to lay out multiple attachments in a scrollable row:

```text
AttachmentGroup
├── Attachment
└── Attachment
```

## Features

- Icon and image media through `AttachmentMedia`
- Upload states: `idle`, `uploading`, `processing`, `error`, and `done` with built-in styling and a shimmer while in progress
- Three sizes and horizontal or vertical orientation
- A full-card `AttachmentTrigger` that opens a link or dialog while the actions stay independently clickable
- Scrollable, snapping `AttachmentGroup` with an edge fade
- Customizable styling through the `className` prop on every part

## Examples

### Image

Set `variant="image"` on `AttachmentMedia` and render an `<img>` inside it. Use `orientation="vertical"` to stack the media above the content.

<ComponentPreview
  styleName="base-rhea"
  name="attachment-image"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background"
/>

### States

Set `state` to reflect the upload lifecycle. `uploading` and `processing` shimmer the title, and `error` switches to a destructive treatment.

<ComponentPreview
  styleName="base-rhea"
  name="attachment-states"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background"
/>

### Sizes

Use `size` to switch between `default`, `sm`, and `xs`.

<ComponentPreview
  styleName="base-rhea"
  name="attachment-sizes"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background"
/>

### Group

Wrap attachments in `AttachmentGroup` to lay them out in a horizontally scrollable, snapping row with an edge fade.

<ComponentPreview
  styleName="base-rhea"
  name="attachment-group"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background"
/>

### Trigger

Add an `AttachmentTrigger` to make the whole card open a link or dialog. It fills the card behind the actions, so the actions stay clickable.

<ComponentPreview
  styleName="base-rhea"
  name="attachment-trigger"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background"
/>

```tsx showLineNumbers
<Dialog>
  <Attachment>
    {/* media, content, actions */}
    <DialogTrigger render={<AttachmentTrigger aria-label="Preview research-summary.pdf" />} />
  </Attachment>
  <DialogContent>{/* ... */}</DialogContent>
</Dialog>
```

## Accessibility

`AttachmentAction` renders a `Button`, and `AttachmentTrigger` renders a real `<button>` (or your element via `render`). Follow the guidance below so both are operable and announced.

### Label icon-only actions

`AttachmentAction` is usually icon-only, so give each one an `aria-label` describing the action and its target.

```tsx showLineNumbers
<AttachmentAction aria-label="Remove sales-dashboard.pdf">
  <XIcon />
</AttachmentAction>
```

### Label the trigger

`AttachmentTrigger` covers the card with no text of its own, so give it an `aria-label` for what activating it does.

```tsx showLineNumbers
<AttachmentTrigger render={<a href={url} target="_blank" rel="noreferrer" aria-label="Open workspace.png" />} />
```

The trigger sits behind the actions in the stacking order, so an `AttachmentAction` and the `AttachmentTrigger` never trap each other — both remain separately focusable and clickable.

### Keyboard scrolling

An `AttachmentGroup` scrolls horizontally. When its attachments are interactive: a trigger or actions, keyboard users reach off-screen items by tabbing to them. For a row of presentational attachments, make the group itself focusable and scrollable by adding `tabIndex={0}`, `role="group"`, and an `aria-label`.

### Meaning beyond color

The `error` state uses a destructive color. Keep the failure reason in `AttachmentDescription` so the state is not conveyed by color alone.

## API Reference

### Attachment

The root attachment container.

| Prop          | Type                                                         | Default        | Description                                       |
| ------------- | ------------------------------------------------------------ | -------------- | ------------------------------------------------- |
| `state`       | `"idle" \| "uploading" \| "processing" \| "error" \| "done"` | `"done"`       | The upload state. Drives styling and the shimmer. |
| `size`        | `"default" \| "sm" \| "xs"`                                  | `"default"`    | The attachment size.                              |
| `orientation` | `"horizontal" \| "vertical"`                                 | `"horizontal"` | Lay the media beside or above the content.        |
| `className`   | `string`                                                     | -              | Additional classes to apply to the root element.  |

### AttachmentMedia

The media slot for an icon or image preview.

| Prop        | Type                | Default  | Description                                    |
| ----------- | ------------------- | -------- | ---------------------------------------------- |
| `variant`   | `"icon" \| "image"` | `"icon"` | Whether the media holds an icon or an `<img>`. |
| `className` | `string`            | -        | Additional classes to apply to the media slot. |

### AttachmentContent

Wraps the title and description.

| Prop        | Type     | Default | Description                                      |
| ----------- | -------- | ------- | ------------------------------------------------ |
| `className` | `string` | -       | Additional classes to apply to the content slot. |

### AttachmentTitle

The attachment name. Shimmers while the attachment is `uploading` or `processing`.

| Prop        | Type     | Default | Description                               |
| ----------- | -------- | ------- | ----------------------------------------- |
| `className` | `string` | -       | Additional classes to apply to the title. |

### AttachmentDescription

Secondary metadata such as the file type, size, or upload status.

| Prop        | Type     | Default | Description                                     |
| ----------- | -------- | ------- | ----------------------------------------------- |
| `className` | `string` | -       | Additional classes to apply to the description. |

### AttachmentActions

A container for one or more actions, aligned to the end of the attachment.

| Prop        | Type     | Default | Description                                 |
| ----------- | -------- | ------- | ------------------------------------------- |
| `className` | `string` | -       | Additional classes to apply to the actions. |

### AttachmentAction

An action button. Renders a [`Button`](/docs/components/button) and accepts all of its props.

| Prop       | Type                                  | Default     | Description                              |
| ---------- | ------------------------------------- | ----------- | ---------------------------------------- |
| `size`     | `Button["size"]`                      | `"icon-xs"` | The button size.                         |
| `...props` | `React.ComponentProps<typeof Button>` | -           | Props spread to the underlying `Button`. |

### AttachmentTrigger

A full-card overlay that activates the attachment. Renders a `<button>` by default.

| Prop       | Type                             | Default | Description                                    |
| ---------- | -------------------------------- | ------- | ---------------------------------------------- |
| `render`   | `ReactElement \| function`       | -       | Render as a different element, such as a link. |
| `...props` | `React.ComponentProps<"button">` | -       | Props spread to the trigger element.           |

### AttachmentGroup

Lays out attachments in a horizontally scrollable, snapping row.

| Prop        | Type     | Default | Description                               |
| ----------- | -------- | ------- | ----------------------------------------- |
| `className` | `string` | -       | Additional classes to apply to the group. |

---

title: Bubble
description: Displays conversational content in a message bubble. Supports variants, alignment, grouping, reactions, and collapsible content.
base: base
component: true

---

<ComponentPreview
  styleName="base-rhea"
  name="bubble-demo"
  previewClassName="h-auto theme-blue"
/>

The `Bubble` component displays framed conversational content. Use it for chat text, short structured output, quoted replies, suggestions, and reactions.

For full-featured chat interfaces, use the [`Message`](/docs/components/message) component. `Bubble` is intentionally scoped to the bubble surface. Place avatars, names, timestamps, metadata, and message-level actions in [`Message`](/docs/components/message).

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
npx shadcn@latest add bubble
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource
  name="bubble"
  title="components/ui/bubble.tsx"
  styleName="base-rhea"
/>

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```tsx showLineNumbers
import { Bubble, BubbleContent, BubbleReactions } from '@/components/ui/bubble'
```

```tsx showLineNumbers
<Bubble>
  <BubbleContent>I checked the registry output and removed the stale route.</BubbleContent>
  <BubbleReactions>
    <span>👍</span>
  </BubbleReactions>
</Bubble>
```

## Composition

Use the following composition to build a bubble:

```text
Bubble
├── BubbleContent
└── BubbleReactions
```

Use `BubbleGroup` to group consecutive bubbles from the same sender:

```text
BubbleGroup
├── Bubble
│   └── BubbleContent
└── Bubble
    └── BubbleContent
```

## Features

- Seven visual variants, from a strong primary bubble to unframed ghost content
- Start and end alignment for sender and receiver bubbles
- Reactions that anchor to the bubble edge with configurable side and alignment
- Bubbles size to their content, up to 80% of the container width
- Polymorphic content via `render` for link and button bubbles
- Customizable styling through the `className` prop on every part

## Examples

### Variants

Use `variant` to change the visual treatment of the bubble.

<ComponentPreview
  styleName="base-rhea"
  name="bubble-variants"
  previewClassName="h-auto theme-blue"
/>

| Variant       | Description                                            |
| ------------- | ------------------------------------------------------ |
| `default`     | A strong primary bubble, usually for the current user. |
| `secondary`   | The standard neutral bubble for conversation content.  |
| `muted`       | A lower-emphasis bubble for quiet supporting content.  |
| `tinted`      | A subtle primary-tinted bubble.                        |
| `outline`     | A bordered bubble for secondary or rich content.       |
| `ghost`       | Unframed content for assistant text or rich content.   |
| `destructive` | A destructive bubble for error or failed actions.      |

A bubble sizes to its content, up to 80% of the container width. The `ghost` variant removes the max-width so assistant text and rich content can span the full row.

### Alignment

Use `align` on `Bubble` to align the bubble to the start or end of the conversation.

<ComponentPreview
  styleName="base-rhea"
  name="bubble-alignment"
  previewClassName="h-auto theme-blue"
/>

| align   | Description                                        |
| ------- | -------------------------------------------------- |
| `start` | Align the bubble to the start of the conversation. |
| `end`   | Align the bubble to the end of the conversation.   |

**Note:** When building chat interfaces, you probably want to use alignment on the `Message` component itself, not the `Bubble` component. You can use the `role` prop on the `Message` component to automatically align the bubble to the start or end of the conversation.

### Bubble Group

Use `BubbleGroup` to group consecutive bubbles from the same sender. Note the `align` prop should be set on the `Bubble` component itself, not the `BubbleGroup` component.

```text
BubbleGroup
├── Bubble
│   └── BubbleContent
└── Bubble
    └── BubbleContent
```

<ComponentPreview
  styleName="base-rhea"
  name="bubble-group-demo"
  previewClassName="h-auto theme-blue"
/>

### Links and Buttons

You can turn a bubble into a link or button by using the `render` prop on `BubbleContent`.

<ComponentPreview
  styleName="base-rhea"
  name="bubble-link-button"
  previewClassName="h-auto theme-blue"
/>

```tsx showLineNumbers
import { Bubble, BubbleContent } from '@/components/ui/bubble'

export function BubbleLinkDemo() {
  return (
    <Bubble variant="muted">
      <BubbleContent render={<button />}>Click here</BubbleContent>
    </Bubble>
  )
}
```

### Reactions

Use `BubbleReactions` for bubble reactions. You can use it to display reactions or quick action buttons. Use `side` and `align` to position the row — `side="top"` anchors it to the upper edge. Reactions overlap the bubble edge, so leave vertical space between rows — the examples below use a larger `gap` for this reason.

<ComponentPreview
  styleName="base-rhea"
  name="bubble-reactions"
  previewClassName="h-auto theme-blue"
/>

### Show More / Collapsible

Long bubble content can be composed with [`Collapsible`](/docs/components/collapsible) to allow for a show more or show less interaction. Use the `CollapsibleTrigger` component to trigger the collapsible content.

<ComponentPreview
  styleName="base-rhea"
  name="bubble-collapsible"
  previewClassName="h-auto theme-blue"
/>

### Tooltip

Wrap a bubble in a [`Tooltip`](/docs/components/tooltip) to reveal metadata on hover, such as when a message was read.

<ComponentPreview
  styleName="base-rhea"
  name="bubble-tooltip"
  previewClassName="h-auto theme-blue"
/>

### Popover

Pair a bubble with a [`Popover`](/docs/components/popover) to surface more information on demand, such as the full error message for a failed action.

<ComponentPreview
  styleName="base-rhea"
  name="bubble-popover"
  previewClassName="h-auto theme-blue"
/>

## Accessibility

`Bubble` renders the presentational message surface. Keep conversation-level semantics on the surrounding container and follow the guidelines below.

### Labeling Reactions

Reactions render as a row of emoji. A screen reader reads each glyph with no context, and counters like `+8` are announced as "plus eight". Group the row as a single image with a descriptive `aria-label` so it announces once. `role="img"` also hides the individual emoji from assistive tech, so no `aria-hidden` is needed.

```tsx showLineNumbers
<BubbleReactions role="img" aria-label="Reactions: thumbs up, fire, and 8 more">
  <span>👍</span>
  <span>🔥</span>
  <span>+8</span>
</BubbleReactions>
```

When reactions are interactive, render buttons instead and give icon-only buttons an `aria-label`.

```tsx showLineNumbers
<BubbleReactions>
  <Button aria-label="Thumbs up" variant="secondary" size="icon-xs">
    <ThumbsUpIcon />
  </Button>
</BubbleReactions>
```

### Interactive Bubbles

When a bubble is clickable, render it as a real `<button>` or `<a>` with the `render` prop so it is focusable and exposes the correct role. `BubbleContent` ships a visible focus ring for interactive elements, and the accessible name comes from the bubble text. No extra label is needed.

```tsx showLineNumbers
<Bubble variant="muted" align="end">
  <BubbleContent render={<button type="button" onClick={onReply} />}>I forgot my password</BubbleContent>
</Bubble>
```

### Meaning Beyond Color

Bubble variants signal role and tone with color. Pair them with text, alignment, or icons so meaning is not conveyed by color alone. For a `destructive` bubble, keep the error context in the message text rather than relying on the color treatment.

## API Reference

### Bubble

The root bubble wrapper.

| Prop        | Type                                                                                       | Default     | Description                                      |
| ----------- | ------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------ |
| `variant`   | `"default" \| "secondary" \| "muted" \| "tinted" \| "outline" \| "ghost" \| "destructive"` | `"default"` | The bubble visual treatment.                     |
| `align`     | `"start" \| "end"`                                                                         | `"start"`   | The inline alignment of the bubble.              |
| `className` | `string`                                                                                   | -           | Additional classes to apply to the root element. |

### BubbleContent

The bubble content wrapper.

| Prop        | Type                       | Default | Description                                               |
| ----------- | -------------------------- | ------- | --------------------------------------------------------- |
| `render`    | `ReactElement \| function` | -       | Render the content as a different element such as a link. |
| `className` | `string`                   | -       | Additional classes to apply to the content element.       |

### BubbleReactions

Displays overlapped reactions for a bubble.

| Prop        | Type                | Default    | Description                                      |
| ----------- | ------------------- | ---------- | ------------------------------------------------ |
| `side`      | `"top" \| "bottom"` | `"bottom"` | The side of the bubble to anchor the reactions.  |
| `align`     | `"start" \| "end"`  | `"end"`    | The inline alignment of the reactions.           |
| `className` | `string`            | -          | Additional classes to apply to the reaction row. |

### BubbleGroup

Groups consecutive bubbles from the same sender.

| Prop        | Type     | Default | Description                                    |
| ----------- | -------- | ------- | ---------------------------------------------- |
| `className` | `string` | -       | Additional classes to apply to the group root. |

---

title: Marker
description: Displays an inline status, system note, bordered row, or labeled separator in a conversation.
base: base
component: true

---

<ComponentPreview
  styleName="base-rhea"
  name="marker-demo"
  previewClassName="h-auto theme-blue"
/>

The `Marker` component displays inline conversation markers such as status updates, system notes, bordered rows, and labeled separators. Compose it with [`Message`](/docs/components/message) in a conversation thread.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
npx shadcn@latest add marker
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource
  name="marker"
  title="components/ui/marker.tsx"
  styleName="base-rhea"
/>

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```tsx showLineNumbers
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
```

```tsx showLineNumbers
<Marker>
  <MarkerIcon>
    <CheckIcon />
  </MarkerIcon>
  <MarkerContent>Explored 4 files</MarkerContent>
</Marker>
```

## Composition

Use the following composition to build a marker:

```text
Marker
├── MarkerIcon
└── MarkerContent
```

## Features

- Inline marker, bordered row, and labeled separator variants
- Decorative icon slot that is hidden from assistive tech
- Polymorphic root via `render` for link and button markers
- Pairs with the [`shimmer`](/docs/utils/shimmer) utility for streaming status text
- Customizable styling through the `className` prop on every part

## Examples

### Variants

Use `variant` to switch between an inline marker, bordered row, and labeled separator.

<ComponentPreview
  styleName="base-rhea"
  name="marker-variants"
  previewClassName="h-auto theme-blue"
/>

| Variant     | Description                                          |
| ----------- | ---------------------------------------------------- |
| `default`   | An inline marker for status, notes, and actions.     |
| `border`    | A default marker with a bottom border under the row. |
| `separator` | A centered label with divider lines on each side.    |

### Status

Set `role="status"` and include a [`Spinner`](/docs/components/spinner) for streaming or in-progress markers so updates are announced.

<ComponentPreview
  styleName="base-rhea"
  name="marker-status"
  previewClassName="h-auto theme-blue"
/>

### Shimmer

Add the [`shimmer`](/docs/utils/shimmer) utility class to `MarkerContent` for an animated streaming-text effect. The utility ships with the `shadcn` package — see the shimmer docs for installation.

<ComponentPreview
  styleName="base-rhea"
  name="marker-shimmer"
  previewClassName="h-auto theme-blue"
/>

### Separator

Use the `separator` variant for labeled dividers, such as dates or section breaks, in a conversation.

<ComponentPreview
  styleName="base-rhea"
  name="marker-separator"
  previewClassName="h-auto theme-blue"
/>

### Border

Use the `border` variant for status rows that should keep the default marker alignment while separating the next row.

<ComponentPreview
  styleName="base-rhea"
  name="marker-border"
  previewClassName="h-auto theme-blue"
/>

### With Icon

Use `MarkerIcon` to render an icon alongside the content. Use `flex-col` to stack the icon above the content.

<ComponentPreview
  styleName="base-rhea"
  name="marker-icon"
  previewClassName="h-auto theme-blue"
/>

### Links and Buttons

Turn a marker into a link or button with the `render` prop on `Marker`.

<ComponentPreview
  styleName="base-rhea"
  name="marker-link-button"
  previewClassName="h-auto theme-blue"
/>

```tsx showLineNumbers
import { Marker, MarkerContent } from '@/components/ui/marker'

export function MarkerLinkDemo() {
  return (
    <Marker render={<a href="#" />}>
      <MarkerContent>View the pull request</MarkerContent>
    </Marker>
  )
}
```

## Accessibility

`Marker` is presentational by default. The correct semantics depend on how you use it, so choose the role based on intent rather than relying on a single default.

### Status and Progress

For streaming or progress markers such as "Thinking..." or a running tool, set `role="status"` so assistive tech announces the update as it appears. `Marker` forwards `role` to the underlying element.

```tsx showLineNumbers
<Marker role="status">
  <MarkerIcon>
    <Spinner />
  </MarkerIcon>
  <MarkerContent>Compacting conversation</MarkerContent>
</Marker>
```

### Labeled Separators

A separator that carries text, such as a date or a section label, needs no role. The divider lines are decorative CSS pseudo-elements, and the text is announced as ordinary content.

```tsx showLineNumbers
<Marker variant="separator">
  <MarkerContent>Today</MarkerContent>
</Marker>
```

<Callout>
  **Note:** Do not add `role="separator"` to a labeled divider. A separator
  takes its accessible name from `aria-label`, not from its text, and its
  contents are treated as presentational, so the visible label would not be
  announced. Reserve `role="separator"` for a divider with no meaningful text.
</Callout>

### Bordered Markers

A bordered marker keeps the same semantics as the default marker. The bottom border is decorative, so choose `role="status"`, `render`, or no role based on the marker's purpose.

```tsx showLineNumbers
<Marker variant="border">
  <MarkerIcon>
    <FileTextIcon />
  </MarkerIcon>
  <MarkerContent>Opened implementation notes</MarkerContent>
</Marker>
```

### Decorative Icons

`MarkerIcon` is decorative and hidden from assistive tech with `aria-hidden`, so the adjacent `MarkerContent` carries the meaning. For an icon-only marker, provide an `aria-label` or visible text so it is not announced as empty.

```tsx showLineNumbers
<Marker aria-label="Synced">
  <MarkerIcon>
    <CheckIcon />
  </MarkerIcon>
</Marker>
```

### Interactive Markers

When a marker links or triggers an action, render it as a real `<button>` or `<a>` with the `render` prop so it is focusable and exposes the correct role. The accessible name comes from the marker text.

```tsx showLineNumbers
<Marker render={<a href="/files" />}>
  <MarkerIcon>
    <FileTextIcon />
  </MarkerIcon>
  <MarkerContent>Explored 4 files</MarkerContent>
</Marker>
```

## API Reference

### Marker

The root marker element. The file also exports `markerVariants` for composing the marker styles into custom components.

| Prop        | Type                                   | Default     | Description                                      |
| ----------- | -------------------------------------- | ----------- | ------------------------------------------------ |
| `variant`   | `"default" \| "border" \| "separator"` | `"default"` | The marker layout.                               |
| `render`    | `ReactElement \| function`             | -           | Render as a different element, such as a link.   |
| `className` | `string`                               | -           | Additional classes to apply to the root element. |

### MarkerIcon

A decorative icon slot. Hidden from assistive tech with `aria-hidden`.

| Prop        | Type     | Default | Description                                   |
| ----------- | -------- | ------- | --------------------------------------------- |
| `className` | `string` | -       | Additional classes to apply to the icon slot. |

### MarkerContent

The marker text content.

| Prop        | Type     | Default | Description                                      |
| ----------- | -------- | ------- | ------------------------------------------------ |
| `className` | `string` | -       | Additional classes to apply to the content slot. |

---

title: Message
description: Displays a message in a conversation, with optional avatar, header, footer, and alignment.
base: base
component: true

---

<ComponentPreview
  styleName="base-rhea"
  name="message-demo"
  previewClassName="h-auto theme-blue"
/>

The `Message` component lays out a single message in a conversation. It handles the avatar, alignment, header, and footer around the message surface.

For AI apps, you can render reasoning steps, tool calls and assistant messages using the `Message` component.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
npx shadcn@latest add message
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource
  name="message"
  title="components/ui/message.tsx"
  styleName="base-rhea"
/>

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```tsx showLineNumbers
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageAvatar, MessageContent } from '@/components/ui/message'
```

```tsx showLineNumbers
<Message>
  <MessageAvatar>
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  </MessageAvatar>
  <MessageContent>
    <Bubble>
      <BubbleContent>How can I help you today?</BubbleContent>
    </Bubble>
  </MessageContent>
</Message>
```

**Note:** `Message` owns the row layout—avatar, alignment, header, and footer.
Render the visible message surface inside it with
[`Bubble`](/docs/components/bubble). For the scroll container around a
conversation, use [`MessageScroller`](/docs/components/message-scroller).

## Composition

Use the following composition to build a message:

```text
Message
├── MessageAvatar
└── MessageContent
    ├── MessageHeader
    ├── Bubble
    └── MessageFooter
```

Use `MessageGroup` to stack consecutive messages from the same sender:

```text
MessageGroup
├── Message
└── Message
```

## Features

- Start and end alignment for sender and receiver rows via the `align` prop
- Avatar slot that anchors to the bottom of the message and stays clear of the footer
- Header and footer slots for sender names, status, and message actions
- Footer follows the message side; actions stay aligned on `align="end"` rows
- Group wrapper for stacking consecutive messages from the same sender
- Customizable styling through the `className` prop on every part

## Examples

### Avatar

Use `MessageAvatar` to render an avatar next to the message. Set `align="end"` on the message to align the avatar to the end of the message.

<ComponentPreview
  styleName="base-rhea"
  name="message-avatar"
  previewClassName="h-auto theme-blue"
/>

| align   | Description                                         |
| ------- | --------------------------------------------------- |
| `start` | Align the message to the start of the conversation. |
| `end`   | Align the message to the end of the conversation.   |

### Group

Use `MessageGroup` to stack consecutive messages from the same sender. Render an empty `MessageAvatar` on the earlier messages to keep them aligned with the avatar on the last one.

<ComponentPreview
  styleName="base-rhea"
  name="message-group"
  previewClassName="h-auto theme-blue"
/>

### Header and Footer

Use `MessageHeader` for a sender name and `MessageFooter` for metadata such as a delivery or read status.

<ComponentPreview
  styleName="base-rhea"
  name="message-header-footer"
  previewClassName="h-auto theme-blue"
/>

### Actions

Place message-level actions in `MessageFooter`, such as copy, retry, or feedback buttons.

<ComponentPreview
  styleName="base-rhea"
  name="message-actions"
  previewClassName="h-auto theme-blue"
/>

### Attachment

<ComponentPreview
  styleName="base-rhea"
  name="message-attachment"
  previewClassName="h-auto theme-blue"
/>

## Accessibility

`Message` is a presentational layout wrapper. Accessibility comes from the content you place inside it.

### Label icon-only actions

Action buttons in `MessageFooter` are usually icon-only, so give each one an `aria-label`.

```tsx showLineNumbers
<MessageFooter>
  <Button variant="ghost" size="icon" aria-label="Copy">
    <CopyIcon />
  </Button>
</MessageFooter>
```

### Status updates

For in-progress messages, use a [`Marker`](/docs/components/marker) with `role="status"` so assistive tech announces the update as it appears.

```tsx showLineNumbers
<Message>
  <Marker role="status">
    <MarkerIcon>
      <Spinner />
    </MarkerIcon>
    <MarkerContent>Checking the logs...</MarkerContent>
  </Marker>
</Message>
```

## API Reference

### Message

The message row wrapper.

| Prop        | Type               | Default   | Description                                       |
| ----------- | ------------------ | --------- | ------------------------------------------------- |
| `align`     | `"start" \| "end"` | `"start"` | The alignment of the message in the conversation. |
| `className` | `string`           | -         | Additional classes to apply to the row.           |

### MessageGroup

Groups consecutive messages from the same sender.

| Prop        | Type     | Default | Description                                    |
| ----------- | -------- | ------- | ---------------------------------------------- |
| `className` | `string` | -       | Additional classes to apply to the group root. |

### MessageAvatar

The avatar slot, aligned to the bottom of the message. When the message has a `MessageFooter`, the avatar shifts up to stay aligned with the message surface instead of the footer.

| Prop        | Type     | Default | Description                                     |
| ----------- | -------- | ------- | ----------------------------------------------- |
| `className` | `string` | -       | Additional classes to apply to the avatar slot. |

### MessageContent

Wraps the header, message surface, and footer.

| Prop        | Type     | Default | Description                                      |
| ----------- | -------- | ------- | ------------------------------------------------ |
| `className` | `string` | -       | Additional classes to apply to the content slot. |

### MessageHeader

Displays content above the message, such as a sender name. Stays aligned to the start regardless of `align`.

| Prop        | Type     | Default | Description                                |
| ----------- | -------- | ------- | ------------------------------------------ |
| `className` | `string` | -       | Additional classes to apply to the header. |

### MessageFooter

Displays content below the message, such as status or actions. Aligns to the message side.

| Prop        | Type     | Default | Description                                |
| ----------- | -------- | ------- | ------------------------------------------ |
| `className` | `string` | -       | Additional classes to apply to the footer. |

---

title: Message Scroller
description: A chat scroll container that anchors turns, opens saved transcripts, follows streamed responses, loads history without jumping, and jumps to any message.
base: base
component: true

---

<ComponentPreview
  styleName="base-rhea"
  name="message-scroller-demo"
  className="rounded-[34px] sm:rounded-4xl"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16"
/>

## What Makes a Great Streaming Chat Experience

Building a chat interface used to be simple. You create an inverted list with
an input. Type a message, it appends at the bottom. When a reply comes in, the
list grows and scrolls. Done.

Streaming breaks that model. Messages arrive in chunks while you may still be
reading, scrolling, or looking somewhere else entirely.

Now the challenge is preserving the reader's place while the conversation keeps
changing. Get that wrong and the experience feels jumpy: people are pulled to
the bottom, lose context, and have to find their way back.

In practice, this comes down to scroll: when to follow, when to hold, and when
to let the reader decide. A great streaming chat should:

1. **Move only when the reader asked to move.** If someone is reading, don’t pull them somewhere else. Auto-scroll should never be the default.
2. **Follow only while they’re following.** If they’re at the live edge, keep the stream in view. If they scroll away, leave them there.
3. **Every interaction is a signal.** Scrolling is not the only one. Selecting text, using the keyboard, opening a link, or searching should all stop the interface from moving.
4. **Start a new turn near the top of the viewport.** This gives the new turn somewhere it can be read from the beginning.
5. **Then stream in the answer.** The answer should grow into the screen, not immediately push everything away.
6. **Keep part of the previous conversation in context.** The prompt and reply should stay visually connected, and enough of the previous turn should remain visible so the reader knows where they are.
7. **Let new content arrive offscreen.** The conversation can keep streaming without changing what the reader is looking at.
8. **Show what’s happening out of view.** Make it clear when a response is still streaming or when new messages have arrived.
9. **Make it easy to return to the latest reply.** A “Jump to latest” action should bring the reader back and resume following.
10. **Let people jump anywhere in the conversation.** Long threads need message links, search, unread markers, and direct navigation.
11. **Reopen where the reader left off.** A saved conversation should open at the last meaningful turn. Often this is the last user message. Not the absolute bottom.
12. **Keep the reader’s place when layout changes.** Images load. Markdown expands. Code blocks render. Older messages appear above. None of that should make the reader lose their place.
13. **Handle interruptions without stealing position.** Stopping, retrying, regenerating, branching, or errors should not unexpectedly move the conversation.
14. **Stay responsive in long threads.** Streaming text, markdown, code, images, and long history should still feel responsive.
15. **Be accessible without the noise.** Keep the transcript navigable, preserve keyboard focus, and announce important events at a comfortable pace.

**Never move the reader against their intent.**

## MessageScroller

MessageScroller is a chat transcript scroller built for these behaviors.
`MessageScrollerProvider` owns the scroll state and transcript-row behavior:
opening position, streamed output, new-turn anchoring, prepended history,
visibility, and scroll controls. `MessageScroller` is the styled frame that
renders inside it.

MessageScroller is scoped to the scroll viewport. It does not own messages, AI state,
transport, persistence, branching, or model state. Your product code stays
focused on composing messages, markers, tools, attachments, and prompt inputs.

It gives you the scroll behavior that chat needs, without taking over the rest
of the chat UI. And it stays fast, even in long conversations with rich
markdown.

## Installation

<CodeTabs>

<TabsList>
  <TabsTrigger value="cli">Command</TabsTrigger>
  <TabsTrigger value="manual">Manual</TabsTrigger>
</TabsList>
<TabsContent value="cli">

```bash
npx shadcn@latest add message-scroller
```

</TabsContent>

<TabsContent value="manual">

<Steps className="mb-0 pt-2">

<Step>Install the following dependencies:</Step>

```bash
npm install @shadcn/react
```

<Step>Copy and paste the following code into your project.</Step>

<ComponentSource
  name="message-scroller"
  title="components/ui/message-scroller.tsx"
  styleName="base-nova"
/>

<Step>Update the import paths to match your project setup.</Step>

</Steps>

</TabsContent>

</CodeTabs>

## Usage

```tsx
import { Message } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
```

```tsx
<MessageScrollerProvider autoScroll>
  <MessageScroller>
    <MessageScrollerViewport>
      <MessageScrollerContent>
        {messages.map(message => (
          <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === 'user'}>
            <Message />
          </MessageScrollerItem>
        ))}
      </MessageScrollerContent>
    </MessageScrollerViewport>
    <MessageScrollerButton />
  </MessageScroller>
</MessageScrollerProvider>
```

`MessageScroller` fills its parent, so place it inside a height-constrained
container.

```tsx
<div className="flex h-screen flex-col">
  <MessageScrollerProvider>
    <MessageScroller className="flex-1">{/* transcript */}</MessageScroller>
  </MessageScrollerProvider>
</div>
```

## Composition

```tsx
<MessageScrollerProvider>
  <MessageScroller>
    <MessageScrollerViewport>
      <MessageScrollerContent>
        <MessageScrollerItem>{/* a message, marker, or row */}</MessageScrollerItem>
        <MessageScrollerItem />
        <MessageScrollerItem />
      </MessageScrollerContent>
    </MessageScrollerViewport>
    <MessageScrollerButton />
  </MessageScroller>
</MessageScrollerProvider>
```

- **`MessageScrollerProvider`** — the headless root. Owns scroll state and the
  behavior props for opening position, auto-scroll, anchoring, scroll commands,
  and visibility tracking.
- **`MessageScroller`** — the styled frame. Lays out the viewport, content, and
  controls inside the provider.
- **`MessageScrollerViewport`** — the scrollable element. Receives native scroll
  events and preserves the visible row when older messages are prepended.
- **`MessageScrollerContent`** — the transcript container. Holds the rows and
  provides the live-region defaults for new messages.
- **`MessageScrollerItem`** — the transcript row boundary. Wrap every direct
  child of the content so the scroller can measure, anchor, preserve position,
  track visibility, and jump to it. An item can be a message, marker, typing
  indicator, separator, join/leave event, or "load earlier" row.
- **`MessageScrollerButton`** — the scroll control. Scrolls to the start or end of the transcript and is inert until there is content in its direction.

## Core Concepts

### Anchoring Turns

A turn is the part of the conversation that starts a new exchange. In a simple
AI chat, that is usually the user's message and the assistant reply that follows.

An anchor is the row the viewport should treat as the start of that turn. Mark
that row with `scrollAnchor`. When a new anchor is appended, the viewport moves
it near the top and keeps a peek of the previous item above it, so the new turn
does not feel detached from its context.

```tsx
// This tells the scroller to anchor the user's message for the next turn.
<MessageScrollerItem messageId={message.id} scrollAnchor={message.role === 'user'} />
```

Scroll anchors are not tied to message role. You can turn any row into an anchor:
a user message, a system marker, a handoff event, or anything else that starts a
meaningful turn. `MessageScroller` only needs to know which row should anchor the
viewport.

In the following example, the user's message is anchored. When you send a new message, the viewport anchors it near the top and appends the assistant reply below it. Toggle the anchor to the assistant's message to see the difference.

<ComponentPreview
  styleName="base-rhea"
  name="message-scroller-anchoring"
  className="rounded-[34px] sm:rounded-4xl"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16"
/>

### Group Chat

In a group chat, the turn boundary is more specific than "the user message". It is often
the message that asks the model to respond, or a marker like "Marcus joined the
chat". Typing indicators and history controls usually should not anchor.

Because anchoring is role-independent, you can anchor a marker just as easily as
a message.

```tsx
<MessageScrollerItem messageId="marcus-joined" scrollAnchor>
  <Marker variant="separator">
    <MarkerContent>Marcus joined the chat</MarkerContent>
  </Marker>
</MessageScrollerItem>
```

<ComponentPreview
  styleName="base-rhea"
  name="message-scroller-group-chat"
  className="rounded-[34px] sm:rounded-4xl"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16"
/>

### Keeping Context Visible

When a new turn starts, it should still feel like part of the same continuous
thread. `scrollPreviousItemPeek` keeps a slice of the previous item visible
above the anchor, so the reader keeps their context instead of feeling like the
conversation restarted on a blank page.

```tsx
// Keep 64px of the previous turn visible above the newly anchored row.
<MessageScrollerProvider scrollPreviousItemPeek={64}>
  <MessageScroller>{/* anchored turns */}</MessageScroller>
</MessageScrollerProvider>
```

Adjust the peek amount in the example below to see how it affects the conversation.

<ComponentPreview
  styleName="base-rhea"
  name="message-scroller-previous-context"
  className="rounded-[34px] sm:rounded-4xl"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16"
/>

### Following the Live Edge

When the reader is at the live edge, either because they stayed there or
returned there, `autoScroll` keeps streamed replies in view as they grow.
Scrolling away from the live edge releases the view, whether by wheel, touch,
keyboard scroll keys, or dragging the scrollbar. An explicit message jump
releases it too. New chunks can then arrive without moving the reader.

```tsx
<MessageScrollerProvider autoScroll>
  <MessageScroller>{/* streamed turns */}</MessageScroller>
</MessageScrollerProvider>
```

<ComponentPreview
  styleName="base-rhea"
  name="message-scroller-streaming"
  className="rounded-[34px] sm:rounded-4xl"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16"
/>

Calling `scrollToEnd`, or pressing `MessageScrollerButton`, re-engages
follow-output when `autoScroll` is enabled, so a reader who scrolled away can
return to the live edge and keep following. The root and viewport expose
`data-autoscrolling` while that programmatic scroll to the latest message runs,
so you can conditionally apply styles during the transition.

### Opening Saved Threads

It can seem reasonable to reopen a saved thread at the absolute end of the
transcript, but that often drops the reader into the conversation without enough
context. A better default is `"last-anchor"`: show the last meaningful turn,
like the user's latest message, with the reply below it.

That gives the reader an immediate place in the thread. They can see what they
asked, where the answer starts, and continue from there without reconstructing
the conversation from the bottom edge.

```tsx
<MessageScrollerProvider defaultScrollPosition="last-anchor">
  <MessageScroller>{/* transcript */}</MessageScroller>
</MessageScrollerProvider>
```

<ComponentPreview
  styleName="base-rhea"
  name="message-scroller-opening-position"
  className="rounded-[34px] sm:rounded-4xl"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16"
  hideCode
/>

`"last-anchor"` is keyed on `scrollAnchor`, not message role. If no anchor
exists, or the last anchored turn already fits in the viewport, it falls back to
`"end"`.

Use `"start"` when you want to resume at the beginning of a conversation, or
`"end"` when the absolute latest message is the right place to land.

### Loading Earlier Messages

Loading earlier messages should not move the conversation the reader is already
looking at. When older rows are prepended above the current transcript,
`MessageScrollerViewport` preserves the visible row so the reader stays in the
same place while history loads above them.

This is enabled by default through `preserveScrollOnPrepend`.

<ComponentPreview
  styleName="base-rhea"
  name="message-scroller-load-history"
  className="rounded-[34px] sm:rounded-4xl"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16"
/>

Use stable `messageId` values for message rows. That gives the scroller a
specific row to preserve instead of guessing from whichever pixel happens to sit
at the viewport edge.

### Animating New Messages

`MessageScrollerItem` can be animated directly. Create a motion version of the
item, keep `messageId` and `scrollAnchor` on it, and use transform and opacity
for the entrance.

A common chat pattern is to animate the user's message when it is sent, then let
the assistant reply stream into a regular row below it. Start the user row below
its final position so it feels like it rises from the live edge of the viewport.

```tsx
const MotionMessageScrollerItem = motion.create(MessageScrollerItem)
```

<ComponentPreview
  styleName="base-rhea"
  name="message-scroller-animation"
  className="rounded-[34px] sm:rounded-4xl"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16"
/>

Avoid animating height, margin, or padding for row entrances; those changes can
fight the scroller's positioning work. If the reader prefers reduced motion,
skip the entrance animation and keep the scroll behavior the same.

### Jumping to Messages

Search results, permalinks, outline items, and toolbar buttons often need to
drive the transcript from outside the message list. Use `useMessageScroller` for
those controls. Because the hooks read from `MessageScrollerProvider`, they work
in any component inside the provider, including controls rendered outside the
`MessageScroller` frame.

```tsx
import { useMessageScroller } from '@/components/ui/message-scroller'
```

```tsx
const { scrollToMessage, scrollToEnd, scrollToStart } = useMessageScroller()
```

<ComponentPreview
  styleName="base-rhea"
  name="message-scroller-commands"
  className="rounded-[34px] sm:rounded-4xl"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16"
  hideCode
/>

`scrollToMessage` targets the `messageId` on `MessageScrollerItem`, so rows that
need to be addressable should have stable ids. `scrollToMessage` returns `false`
when the target is not mounted and cannot be queued.

`scrollToMessage` can queue a target before items exist, which covers
client-resolved permalinks while the transcript mounts. After rows have mounted,
a missing id returns `false` instead of starting a guessed retry loop. A `true`
result means the scroll ran or was queued, not that the row is already in view.

### Tracking the Reader's Position

Use `useMessageScrollerVisibility` to track the reader's position in the
conversation. A common example is a table-of-contents or a jump menu that
highlights the current anchored turn.

```tsx
import { useMessageScrollerVisibility } from '@/components/ui/message-scroller'
```

```tsx
const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility()
```

<ComponentPreview
  styleName="base-rhea"
  name="message-scroller-visibility"
  className="rounded-[34px] sm:rounded-4xl"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16"
  hideCode
/>

`currentAnchorId` answers "where am I" by reporting the current anchored turn,
and it stays set after that anchor scrolls above the viewport. `visibleMessageIds`
answers "what is on screen", in document order.

Visibility is pay-for-what-you-use. Tracking only runs while something
subscribes to `useMessageScrollerVisibility`, and rows need a `messageId` to
participate.

### Reading Scroll State

Use `useMessageScrollerScrollable` when you need scroll state in JavaScript, such
as a status indicator or a custom "jump to latest" control. It reports which
edges the viewport can still scroll toward; "at the start/end" is the negation
(`!start` / `!end`), and "scrollable at all" is `start || end`. For styling the
scroller itself, prefer the `data-scrollable` attribute.

```tsx
import { useMessageScrollerScrollable } from '@/components/ui/message-scroller'
```

```tsx
const { start, end } = useMessageScrollerScrollable()
```

<ComponentPreview
  styleName="base-rhea"
  name="message-scroller-scrollable"
  className="rounded-[34px] sm:rounded-4xl"
  previewClassName="h-auto theme-blue bg-surface dark:bg-background p-4 min-[480px]:p-8 min-[560px]:p-10 sm:px-10 sm:py-16"
/>

## Performance

`MessageScroller` is benchmarked against large transcripts with markdown and
composed message rows.

Our performance goal for `MessageScroller` is to keep the scroll hot path outside of React state: no React rerenders for
transcript rows, no forced layout on every scroll, and as little off-screen paint
work as the browser can avoid.

Scroll position, anchoring, and follow-output are tracked imperatively and mirrored onto the root and viewport through `data-*` attributes, so scrolling and streaming do not rerender transcript rows.

The styled `MessageScrollerItem` also ships with `content-visibility: auto` and
`contain-intrinsic-size`. Rows stay in the DOM for selection, copy,
find-in-page, SSR, and assistive tech, but the browser can skip rendering work
for rows far outside the viewport.

Visibility tracking is pay-for-what-you-use. A jump menu or active
turn indicator costs nothing until something subscribes to
`useMessageScrollerVisibility`.

This is comfortable for the expected range of a chat transcript: hundreds to low
thousands of turns, including messages with markdown and composed components.

## Virtualization

Virtualization is intentionally left outside the primitive. `MessageScroller`
renders real DOM rows and stays fast well into the thousands of turns (see
[Performance](#performance)), so most transcripts never need it.

When a transcript is large enough to need virtualization, use
`MessageScrollerViewport` as the scroll element and let the virtualizer own the
rows.

```tsx showLineNumbers
import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

function VirtualizedTranscript({ messages }: { messages: Array<{ id: string; content: React.ReactNode }> }) {
  const viewportRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 86,
    getItemKey: index => messages[index]?.id ?? index,
    overscan: 8,
  })

  return (
    <MessageScrollerProvider>
      <MessageScroller>
        <MessageScrollerViewport ref={viewportRef}>
          <MessageScrollerContent className="block min-h-full">
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map(virtualItem => {
                const message = messages[virtualItem.index]

                if (!message) {
                  return null
                }

                return (
                  <div
                    key={virtualItem.key}
                    ref={virtualizer.measureElement}
                    data-index={virtualItem.index}
                    className="absolute start-0 top-0 w-full"
                    style={{
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <Message>{message.content}</Message>
                  </div>
                )
              })}
            </div>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
```

## Accessibility

`MessageScroller` keeps the scroll container keyboard reachable and the
transcript announceable without forcing a specific message UI.

`MessageScrollerViewport` is a labelled, keyboard-focusable scroll region by
default. It uses `role="region"`, `aria-label="Messages"`, and `tabIndex={0}`,
so keyboard users can focus the transcript and scroll it directly.

`MessageScrollerContent` marks the transcript as a live region with
`role="log"` and `aria-relevant="additions"`. New rows can be announced, but
streamed text mutations do not have to be announced token by token.

```tsx
<MessageScrollerContent aria-busy={status === 'streaming'}>{/* messages */}</MessageScrollerContent>
```

Pass `aria-busy` while a turn streams if announcements should wait for the
completed message row.

`MessageScrollerButton` renders a real button. When there is nothing to scroll
toward, it sets `inert`, uses `tabIndex={-1}`, and exposes `data-active="false"`
so inactive scroll controls do not create extra focus stops.

## Unstyled

The behavior in `MessageScroller` comes from the `@shadcn/react` package. To use
it directly with your own markup and styles, see
[Message Scroller](/docs/react/message-scroller) under @shadcn/react.

## API Reference

The props, data attributes, and hooks for every part are documented on the
[@shadcn/react Message Scroller](/docs/react/message-scroller#api-reference) page.
They are identical for the styled component and the unstyled parts.

---

title: scroll-fade
description: Utilities for adding a fade effect to the edges of a scroll container.

---

<ComponentPreview
  styleName="radix-rhea"
  name="scroll-fade-demo"
  previewClassName="h-auto"
/>

## Installation

If your project was set up with `npx shadcn@latest init`, you already have `scroll-fade`. It ships with the `shadcn` package, which the CLI imports in your global CSS file.

Otherwise, install the `shadcn` package:

```bash
npm install shadcn
```

Then import the shared utilities in your global CSS file:

```css
@import 'tailwindcss';
@import 'shadcn/tailwind.css';
```

## Usage

| Class                             | Styles                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `scroll-fade`                     | `mask-image: var(--scroll-fade-mask, var(--scroll-fade-block));` <br /> `animation-timeline: scroll(self y);`       |
| `scroll-fade-y`                   | `mask-image: var(--scroll-fade-mask, var(--scroll-fade-block));` <br /> `animation-timeline: scroll(self y);`       |
| `scroll-fade-x`                   | `mask-image: var(--scroll-fade-mask, var(--scroll-fade-inline));` <br /> `animation-timeline: scroll(self inline);` |
| `scroll-fade-t`                   | Fade mask on the top edge. <br /> `animation-timeline: scroll(self y);`                                             |
| `scroll-fade-b`                   | Fade mask on the bottom edge. <br /> `animation-timeline: scroll(self y);`                                          |
| `scroll-fade-l`                   | Fade mask on the left edge. <br /> `animation-timeline: scroll(self x);`                                            |
| `scroll-fade-r`                   | Fade mask on the right edge. <br /> `animation-timeline: scroll(self x);`                                           |
| `scroll-fade-s`                   | Fade mask on the start edge, mirrors in RTL. <br /> `animation-timeline: scroll(self inline);`                      |
| `scroll-fade-e`                   | Fade mask on the end edge, mirrors in RTL. <br /> `animation-timeline: scroll(self inline);`                        |
| `scroll-fade-<number>`            | `--scroll-fade-size: calc(var(--spacing) * <number>);`                                                              |
| `scroll-fade-[<value>]`           | `--scroll-fade-size: <value>;`                                                                                      |
| `scroll-fade-{t,b,s,e}-<number>`  | `--scroll-fade-{t,b,s,e}-size: calc(var(--spacing) * <number>);`                                                    |
| `scroll-fade-{t,b,s,e}-[<value>]` | `--scroll-fade-{t,b,s,e}-size: <value>;`                                                                            |
| `scroll-fade-none`                | `--scroll-fade-mask: none;`                                                                                         |

Add `scroll-fade` or `scroll-fade-y` to the scroll container, i.e. the element that has `overflow-y-auto`.

```tsx
<div className="scroll-fade overflow-y-auto">{/* ... */}</div>
```

The fade is scroll-aware and tracks the scroll position:

- At rest, the top edge is crisp and the bottom edge fades to hint at more content.
- As you scroll, a fade appears at the top and both edges stay faded mid-scroll.
- At the end, the bottom edge sharpens to show you have reached the last item.

The fade is applied with `mask-image`, so it dissolves the content itself rather than overlaying a color. The mask uses a linear fade from transparent to black, so it adapts to any background without configuration. If your scroll area sits inside a card, put the background and border on a wrapper and `scroll-fade` on the inner scroller, so the fade dissolves the content and not the card.

The [`ScrollArea`](/docs/components/scroll-area) and [`MessageScroller`](/docs/components/message-scroller) components can use `scroll-fade` on their scrollable viewport.

## No Overflow, No Fade

If the content does not overflow, no fade is shown. You can apply `scroll-fade` to any list without checking whether it scrolls.

<ComponentPreview
  styleName="radix-rhea"
  name="scroll-fade-overflow"
  previewClassName="h-auto"
/>

## Horizontal Scrolling

Use `scroll-fade-x` on containers that scroll horizontally, i.e. the element that has `overflow-x-auto`.

<ComponentPreview
  styleName="radix-rhea"
  name="scroll-fade-horizontal"
  previewClassName="h-64"
/>

```tsx
<div className="flex scroll-fade-x overflow-x-auto">{/* ... */}</div>
```

The horizontal fade is direction-aware. In RTL layouts, the crisp edge and the fade follow the reading direction with no extra classes needed. `scroll-fade-<number>` and `scroll-fade-none` work the same for both axes.

## Edge Fades

Use edge utilities when only one edge should track the scroll position.

<ComponentPreview
  styleName="radix-rhea"
  name="scroll-fade-edge"
  previewClassName="h-auto"
/>

```tsx
<div className="scroll-fade-b overflow-y-auto">{/* ... */}</div>
```

The edge utilities are scroll-aware. Start edges fade in after you scroll away from the start, and end edges fade out when you reach the end. Use `scroll-fade-t`, `scroll-fade-b`, `scroll-fade-l`, and `scroll-fade-r` for physical edges. Use `scroll-fade-s` and `scroll-fade-e` for logical inline edges that mirror in RTL.

## Fade Size

The fade depth defaults to `12%` of the container, capped at `40px` so tall scrollers stay subtle. Use `scroll-fade-<number>` to set a fixed size on the spacing scale instead, the same way `scroll-mt-<number>` works.

<ComponentPreview
  styleName="radix-rhea"
  name="scroll-fade-size"
  previewClassName="h-auto"
/>

```tsx
<div className="scroll-fade overflow-y-auto scroll-fade-24">{/* ... */}</div>
```

For one-off values, use an arbitrary length or percentage:

```tsx
<div className="scroll-fade overflow-y-auto scroll-fade-[15%]">{/* ... */}</div>
```

To fade opposite edges by different amounts, use the per-edge modifiers `scroll-fade-t-<number>`, `scroll-fade-b-<number>`, `scroll-fade-s-<number>`, and `scroll-fade-e-<number>`. They override `scroll-fade-<number>` on the edge they target and accept arbitrary values too.

```tsx
<div className="scroll-fade overflow-y-auto scroll-fade-b-8 scroll-fade-t-2">{/* ... */}</div>
```

Use the logical `s`/`e` modifiers for horizontal scrollers so the sizes mirror in RTL.

The fade eases in and out over a fixed scroll distance rather than appearing instantly. That distance is the `--scroll-fade-reveal` variable, `96px` by default and independent of the fade depth. Lower it for a snappier reveal or raise it for a more gradual one:

```tsx
<div className="scroll-fade overflow-y-auto [--scroll-fade-reveal:64px]">{/* ... */}</div>
```

## Disabling the Fade

Use `scroll-fade-none` to remove the fade. It works in any class order, so the typical use is responsive or stateful:

```tsx
<div className="scroll-fade overflow-y-auto md:scroll-fade-none">{/* ... */}</div>
```

<ComponentPreview
  styleName="radix-rhea"
  name="scroll-fade-none"
  previewClassName="h-auto"
/>

## Fallback

The scroll-aware behavior is implemented with [CSS scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_scroll-driven_animations), with no JavaScript and no scroll listeners. In browsers that do not support scroll-driven animations, `scroll-fade` falls back to a static fade on both edges, and edge utilities fall back to a static fade on the selected edge.

Since the mask is applied to the scroll container itself, a visible scrollbar fades with the content at the edges. Pair `scroll-fade` with `no-scrollbar`, which ships in the same package, if you want to hide the scrollbar entirely.

## RTL

To enable RTL support in shadcn/ui, see the [RTL configuration guide](/docs/rtl).

`scroll-fade-x` follows the reading direction. At rest, the start edge is crisp and the end edge fades. In RTL layouts that means a crisp right edge and a fade on the left, mirrored from LTR.

<ComponentPreview
  styleName="radix-nova"
  name="scroll-fade-rtl"
  direction="rtl"
/>

---

title: shimmer
description: Utilities for adding a shimmer effect to text elements.

---

<ComponentPreview styleName="radix-rhea" name="shimmer-demo" />

## Installation

If your project was set up with `npx shadcn@latest init`, you already have `shimmer`. It ships with the `shadcn` package, which the CLI imports in your global CSS file.

Otherwise, install the `shadcn` package:

```bash
npm install shadcn
```

Then import the shared utilities in your global CSS file:

```css
@import 'tailwindcss';
@import 'shadcn/tailwind.css';
```

## Usage

| Class                         | Styles                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `shimmer`                     | `background-clip: text;` <br /> `animation: tw-shimmer var(--shimmer-duration, 2s) linear infinite;` |
| `shimmer-once`                | `animation-iteration-count: 1;`                                                                      |
| `shimmer-reverse`             | `animation-direction: reverse;`                                                                      |
| `shimmer-none`                | `--shimmer-image: none;` <br /> `--shimmer-text-fill: currentColor;`                                 |
| `shimmer-color-<color>`       | `--shimmer-color: <color>;`                                                                          |
| `shimmer-color-[<value>]`     | `--shimmer-color: <value>;`                                                                          |
| `shimmer-color-<color>/<pct>` | `--shimmer-color: color-mix(in oklch, <color> <pct>, transparent);`                                  |
| `shimmer-duration-<number>`   | `--shimmer-duration: calc(<number> * 1ms);`                                                          |
| `shimmer-spread-<number>`     | `--shimmer-spread: calc(var(--spacing) * <number>);`                                                 |
| `shimmer-spread-[<value>]`    | `--shimmer-spread: <value>;`                                                                         |
| `shimmer-angle-<number>`      | `--shimmer-angle: calc(<number> * 1deg);`                                                            |

Add `shimmer` to a text element.

```tsx
<p className="shimmer text-muted-foreground">Generating response&hellip;</p>
```

The shimmer is built on `currentColor`, so it adapts to the element:

- The highlight is derived from the text color, with no configuration needed.
- It works on any color, from `text-muted-foreground` to brand colors.
- In dark mode, the highlight automatically brightens to stay visible.

The effect is pure CSS. The text is painted with `background-clip: text`, and the highlight sweeps across it in a seamless loop.

## With Marker

The shimmer composes with any component that renders text. A common pattern is a [Marker](/docs/components/marker) showing a live status while the assistant is working:

<ComponentPreview styleName="radix-rhea" name="shimmer-marker" />

```tsx
<Marker role="status">
  <MarkerIcon>
    <Spinner />
  </MarkerIcon>
  <MarkerContent className="shimmer">Thinking&hellip;</MarkerContent>
</Marker>
```

## Color

Use `shimmer-color-<color>` to set the highlight color explicitly. It accepts theme colors with an optional opacity modifier, or any arbitrary color value.

<ComponentPreview styleName="radix-rhea" name="shimmer-color" />

```tsx
<p className="shimmer shimmer-color-blue-500/60">Generating response&hellip;</p>
<p className="shimmer shimmer-color-[#378ADD]">Generating response&hellip;</p>
```

## Duration

Use `shimmer-duration-<number>` to set the duration of one sweep in milliseconds. The default is `2000`, i.e. `2s`.

<ComponentPreview styleName="radix-rhea" name="shimmer-duration" />

```tsx
<p className="shimmer shimmer-duration-1000">Generating response&hellip;</p>
```

## Spread

Use `shimmer-spread-<number>` to set the width of the highlight band using the spacing scale. The default is `calc(3ch + 40px)`: a fixed base plus a `3ch` term that scales with the font size.

<ComponentPreview styleName="radix-rhea" name="shimmer-spread" />

```tsx
<p className="shimmer shimmer-spread-24">Generating response&hellip;</p>
```

For one-off values, use an arbitrary length or percentage:

```tsx
<p className="shimmer shimmer-spread-[5rem]">Generating response&hellip;</p>
```

## Angle

Use `shimmer-angle-<number>` to set the tilt of the highlight band in degrees. The default is `20`.

<ComponentPreview styleName="radix-rhea" name="shimmer-angle" />

```tsx
<p className="shimmer shimmer-angle-45">Generating response&hellip;</p>
```

## Reverse

Use `shimmer-reverse` to sweep the highlight in the opposite direction. In RTL layouts the sweep already follows the reading direction. See [RTL](#rtl).

```tsx
<p className="shimmer shimmer-reverse">Generating response&hellip;</p>
```

## Play Once

Use `shimmer-once` to play a single sweep instead of looping, useful as a reveal when streaming completes. Pair it with `shimmer-duration-<number>` to control how long the sweep takes.

<ComponentPreview styleName="radix-rhea" name="shimmer-once" />

```tsx
<p className="shimmer shimmer-duration-1100 shimmer-once">Response generated.</p>
```

## Disabling the Shimmer

Use `shimmer-none` to turn the effect off and render the text normally. It works in any class order, so the typical use is responsive or stateful:

<ComponentPreview styleName="radix-rhea" name="shimmer-none" />

```tsx
<p className="shimmer md:shimmer-none">Generating response&hellip;</p>
```

## Fallback

The shimmer is built on modern color features, [relative color syntax](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_colors/Relative_colors) and `color-mix()`, which are available in all current browsers. In older browsers without support, the highlight gradient is dropped and the text can render transparent. If you target older browsers, apply `shimmer` conditionally with a `supports-*` variant:

```tsx
<p className="supports-[color:oklch(from_white_l_c_h)]:shimmer">Generating response&hellip;</p>
```

## Reduced Motion

When the user prefers reduced motion, the animation is disabled automatically and the text renders normally. There is nothing to configure.

## RTL

To enable RTL support in shadcn/ui, see the [RTL configuration guide](/docs/rtl).

The sweep follows the reading direction, left to right in LTR and right to left in RTL, with no extra classes. Use `shimmer-reverse` to flip the direction manually.

<ComponentPreview styleName="radix-rhea" name="shimmer-rtl" />
