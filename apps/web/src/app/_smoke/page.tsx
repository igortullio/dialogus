import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <h2 className="font-serif text-lg">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

export default function SmokePage() {
  return (
    <TooltipProvider>
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
        <header className="flex flex-col gap-2">
          <h1 className="font-serif text-3xl">dIAlogus primitive smoke</h1>
          <p className="text-muted-foreground text-sm">
            Renders one of every shadcn primitive plus the Tailwind v4 token surface used by the
            Chat UI feature. This route lives in a private folder (
            <code className="font-mono text-xs">app/_smoke</code>) so Next.js does not expose it as
            a runtime URL.
          </p>
        </header>

        <Section title="Typography">
          <p className="font-sans">Sans: chat prose body</p>
          <p className="font-serif">Serif: book titles &amp; headlines</p>
          <p className="font-mono">Mono: cover-fallback labels</p>
        </Section>

        <Section title="Status palette">
          <Badge className="bg-status-ready text-status-ready-foreground">ready</Badge>
          <Badge className="bg-status-progress text-status-progress-foreground">in progress</Badge>
          <Badge className="bg-status-failed text-status-failed-foreground">failed</Badge>
          <Badge className="bg-scholarly text-scholarly-foreground">scholarly accent</Badge>
        </Section>

        <Section title="Atoms">
          <Button>Default</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="destructive">Destructive</Button>
          <Input placeholder="email@example.com" className="max-w-xs" />
          <Skeleton className="h-8 w-24" />
          <Separator orientation="vertical" className="h-6" />
        </Section>

        <Section title="Card">
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="font-serif">A novel</CardTitle>
              <CardDescription>by an author</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">Card body content with muted prose.</CardContent>
          </Card>
        </Section>

        <Section title="Overlays">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dialog title</DialogTitle>
                <DialogDescription>Confirmation copy.</DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>This soft-deletes the book.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Open sheet</Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Citation panel</SheetTitle>
                <SheetDescription>Full chunk + chapter context lives here.</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        </Section>

        <Section title="Menus & popovers">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Thread menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Renomear</DropdownMenuItem>
              <DropdownMenuItem>Fixar</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Excluir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Spoiler popover</Button>
            </PopoverTrigger>
            <PopoverContent>Spoiler-cap controls.</PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">Hover me</Button>
            </TooltipTrigger>
            <TooltipContent>Citation preview</TooltipContent>
          </Tooltip>
        </Section>

        <Section title="Forms">
          <Select defaultValue="ch-1">
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ch-1">Chapter 1</SelectItem>
              <SelectItem value="ch-2">Chapter 2</SelectItem>
              <SelectItem value="ch-3">Chapter 3</SelectItem>
            </SelectContent>
          </Select>

          <Slider defaultValue={[3]} min={1} max={10} step={1} className="w-48" />
        </Section>

        <Section title="Tabs">
          <Tabs defaultValue="recent" className="w-full">
            <TabsList>
              <TabsTrigger value="recent">Recentes</TabsTrigger>
              <TabsTrigger value="pinned">Fixadas</TabsTrigger>
            </TabsList>
            <TabsContent value="recent">Lista de threads recentes.</TabsContent>
            <TabsContent value="pinned">Lista de threads fixadas.</TabsContent>
          </Tabs>
        </Section>

        <Section title="Custom anchors">
          <div
            className="flex items-center justify-between rounded-md bg-muted px-4"
            style={{ height: 'var(--space-thread-row)' }}
          >
            <span className="font-serif text-sm">Thread row anchor</span>
            <span className="text-muted-foreground font-mono text-xs">
              --space-thread-row = 56px
            </span>
          </div>
          <span
            className="bg-scholarly text-scholarly-foreground inline-flex items-center px-1.5 text-xs"
            style={{ borderRadius: 'var(--radius-cite-badge)' }}
          >
            ¹ cite-badge radius
          </span>
        </Section>

        <Toaster />
      </main>
    </TooltipProvider>
  )
}
