import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", type = "text", ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-foreground mb-1.5">
            {label}
          </label>
        )}
        <input
          type={type}
          ref={ref}
          className={`
            w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground
            placeholder:text-muted-foreground
            outline-none transition-all duration-200
            focus:border-ring focus:ring-2 focus:ring-ring/20
            ${error ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-destructive">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
