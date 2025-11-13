# Wyshbone Status Dashboard - Design Guidelines

## Design Approach
**System-Based Approach**: Drawing from Linear's clean data presentation and monitoring dashboard patterns (Grafana, DataDog). This is a utility-focused technical tool prioritizing clarity, scanability, and rapid information comprehension.

## Core Design Principles
1. **Information Hierarchy**: Metrics and status take visual precedence
2. **Scan-First Design**: Users should grasp system health in < 3 seconds
3. **Delta Emphasis**: Changes are more critical than absolute values
4. **Error Visibility**: Problems must be immediately apparent

## Typography

**Font Stack**: 
- System fonts via `font-sans` (optimized for data readability)
- Monospace for metrics: `font-mono`

**Hierarchy**:
- Page Title (h1): `text-3xl font-bold`
- Section Headers (h2): `text-xl font-semibold`
- Source Names: `text-lg font-medium`
- Metric Labels: `text-sm font-medium text-gray-600`
- Metric Values: `text-2xl font-bold font-mono`
- Delta Values: `text-base font-semibold font-mono`
- Timestamps: `text-xs text-gray-500`
- Ticker Events: `text-sm`

## Layout System

**Spacing Units**: Use Tailwind units of **2, 4, 6, 8** exclusively
- Component padding: `p-6`
- Section spacing: `space-y-8`
- Card gaps: `gap-6`
- Metric spacing: `space-y-2`

**Container Structure**:
- Max width: `max-w-7xl mx-auto`
- Page padding: `px-4 py-8`
- Responsive grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`

## Component Library

### Status Cards (Per Source)
- Rounded corners: `rounded-lg`
- Border: `border-2` (color varies by status)
- Padding: `p-6`
- Shadow: `shadow-md`
- Layout: Vertical stack with clear separation between header, metrics, and status indicator

### Status Indicator Badge
- Positions: Top-right corner of card
- OK State: Solid fill with checkmark icon
- ERROR State: Bold border with alert icon
- Size: `px-3 py-1 rounded-full text-xs font-semibold`

### Metric Display Pattern
```
Label: text-sm, uppercase, tracking-wide
Value: text-2xl, font-mono, bold
Delta: Inline, font-mono, with ↑↓ arrows or +/- prefix
```

### Delta Visualization
- Positive changes: Green text with ↑ or + prefix
- Negative changes: Red text with ↓ or - prefix  
- No change: Muted gray with = or —
- Use semantic classes for consistency

### Ticker Section
- Fixed height scrollable area: `h-48 overflow-y-auto`
- Background: Subtle contrast from page background
- Border: Top and bottom only
- Padding: `p-4`
- Event items: `space-y-2`, each with timestamp prefix

### Page Header
- Centered title with auto-refresh indicator
- Last updated timestamp displayed prominently
- Optional: Small pulse animation on auto-refresh icon

## Data Visualization

### Metric Cards Layout
Each source card contains:
1. **Header**: Source name + status badge
2. **Timestamp**: Last fetched at (relative time preferred: "2m ago")
3. **Primary Metrics Grid** (2 columns):
   - Cleverness Index + delta
   - Lines of Code + delta
4. **Secondary Metrics Row**:
   - TODO count + delta
   - FIXME count + delta

### Ticker Event Format
```
[2m ago] Wyshbone UI: ↑ cleverness +5, ↑ LOC +120, ↑ TODO +1
[5m ago] Supervisor: ↓ cleverness -2, ↓ TODO -3
```

## Responsive Behavior

**Desktop (lg+)**: 3-column grid for source cards
**Tablet (md)**: 2-column grid
**Mobile (base)**: Single column, full width

Maintain full metric visibility at all breakpoints - no truncation or hiding.

## State Indicators

**Loading State**: Subtle pulse animation on entire card
**Error State**: Red border on card, error message in place of metrics
**Stale Data**: Gray out card if fetchedAt > 5 minutes old
**Success State**: Green accent on status badge

## Auto-Refresh Implementation
- Meta refresh tag: 60 seconds
- Visual indicator: Small "Auto-refreshing in Xs" countdown (optional enhancement)
- Preserve scroll position if possible (browser default behavior)

## Accessibility
- Semantic HTML: `<main>`, `<section>`, `<article>` for cards
- ARIA labels on status indicators
- Sufficient contrast ratios for all text (WCAG AA minimum)
- Delta symbols accessible via aria-label

## Performance Considerations
- Minimize DOM complexity (server-rendered, no client JS needed)
- Inline critical CSS for initial render
- Use CSS Grid over Flexbox for card layout (better performance)

This dashboard prioritizes **clarity over aesthetics**, **speed over polish**, and **data density over white space** while maintaining professional presentation standards.