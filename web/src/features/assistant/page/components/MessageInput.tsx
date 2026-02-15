"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@/src/components/ui/input-group";
import TextareaAutosize from "react-textarea-autosize";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: MessageInputProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <InputGroup>
        <TextareaAutosize
          data-slot="input-group-control"
          className="field-sizing-content flex min-h-10 w-full flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none outline-none ring-0 focus-visible:ring-0 md:text-sm"
          placeholder="Ask anything"
          aria-label="Message input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (value.trim() && !disabled) {
                onSubmit();
              }
            }
          }}
        />
        <InputGroupAddon align="block-end">
          <InputGroupButton
            className="ml-auto"
            size="sm"
            variant="default"
            disabled={disabled || !value.trim()}
            onClick={onSubmit}
          >
            Submit
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Press Enter to send, Shift + Enter for new line
      </p>
    </div>
  );
}
