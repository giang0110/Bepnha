import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/app/lib/utils"

const buttonVariants = cva(
  'group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-herb-700 focus-visible:ring-3 focus-visible:ring-herb-500/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-chilli-600 aria-invalid:ring-3 aria-invalid:ring-chilli-600/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        default: "bg-herb-600 text-white shadow-soft hover:bg-herb-700 hover:shadow-lift",
        outline:
          "border-edge-strong bg-paper-raised text-ink hover:bg-herb-50 hover:text-herb-900 aria-expanded:bg-herb-50 aria-expanded:text-herb-900",
        secondary:
          "bg-clay-50 text-clay-900 hover:bg-clay-100 aria-expanded:bg-clay-100 aria-expanded:text-clay-900",
        ghost: "text-ink hover:bg-paper-sunken hover:text-ink aria-expanded:bg-paper-sunken",
        destructive:
          "bg-chilli-50 text-chilli-700 hover:bg-chilli-200/60 focus-visible:border-chilli-600 focus-visible:ring-chilli-600/25",
        link: "text-herb-700 underline-offset-4 hover:underline"
      },
      size: {
        default:
          "h-11 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: 'h-6 gap-1 rounded-md px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*="size-"])]:size-3',
        sm: 'h-9 gap-1 rounded-md px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*="size-"])]:size-3.5',
        lg: "h-12 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        icon: "size-11",
        "icon-xs":
          'size-6 rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*="size-"])]:size-3',
        "icon-sm": "size-7 rounded-md in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-12"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
