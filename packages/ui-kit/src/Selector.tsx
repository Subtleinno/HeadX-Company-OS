import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * 共用選擇器（#118 切片 B）。
 *
 * app 選擇器與工作範圍選擇器都用它，所以鍵盤、焦點與宣佈只可以在這裡做一次。
 *
 * 為甚麼不用原生 `<select>`：混合型的「公司／品牌」要在同一個清單分得開，
 * 而第二步選範圍（切片 C）需要一個可以留住焦點、可以返回的浮層。原生 select
 * 做不到後者，兩個選擇器就會變成兩套行為。
 *
 * 無障礙名稱刻意由 `aria-label` 提供，而不是畫面上的文字 —— 按鈕的可見文字是
 * 「目前選中項」，如果一併當成名稱，讀屏會讀成「工作範圍 品牌甲」，每次都要聽完。
 */

export type SelectorOption = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /**
   * 選中時顯示在文字左邊的圖示（#118 視覺對齊）。
   * 由使用方提供，選擇器本身不知道 app 與品牌的分別。
   */
  icon?: ReactNode;
};

export type SelectorProps = {
  /** 無障礙名稱，例如「選擇 app」。 */
  label: string;
  value: string | null;
  options: readonly SelectorOption[];
  placeholder: string;
  onChange: (id: string) => void;
  disabled?: boolean;
};

export function Selector({ label, value, options, placeholder, onChange, disabled = false }: SelectorProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((option) => option.id === value) ?? null;

  /** 由某個位置出發，找下一個／上一個可用選項；找不到就回同一個位置。 */
  function step(from: number, delta: 1 | -1): number {
    if (options.length === 0) {
      return -1;
    }

    let index = from;

    for (let tries = 0; tries < options.length; tries += 1) {
      index = (index + delta + options.length) % options.length;

      if (options[index]?.disabled !== true) {
        return index;
      }
    }

    return from;
  }

  function firstEnabled(): number {
    const index = options.findIndex((option) => option.disabled !== true);

    return index;
  }

  function openAt(index: number): void {
    setOpen(true);
    setActiveIndex(index);
  }

  function close(restoreFocus: boolean): void {
    setOpen(false);
    setActiveIndex(-1);

    if (restoreFocus) {
      buttonRef.current?.focus();
    }
  }

  function choose(index: number): void {
    const option = options[index];

    if (option === undefined || option.disabled === true) {
      return;
    }

    onChange(option.id);
    close(true);
  }

  // 開啟之後把焦點放到作用中的選項：讀屏要用真實焦點才講得出「第幾個，共幾個」。
  useEffect(() => {
    if (!open) {
      return;
    }

    const target = itemRefs.current[activeIndex];

    if (target !== null && target !== undefined) {
      target.focus();
    }
  }, [open, activeIndex]);

  // 點外面收起。用 mousedown 而不是 click：click 會在選項自己的 handler 之後才到，
  // 會出現「選完又被外面關一次」的雙重處理。
  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current?.contains(event.target as Node) !== true) {
        close(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex(step(activeIndex, 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex(step(activeIndex, -1));
        return;
      case 'Home':
        event.preventDefault();
        setActiveIndex(firstEnabled());
        return;
      case 'End': {
        event.preventDefault();

        let index = options.length - 1;

        while (index > 0 && options[index]?.disabled === true) {
          index -= 1;
        }

        setActiveIndex(index);
        return;
      }
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(activeIndex);
        return;
      case 'Escape':
        event.preventDefault();
        close(true);
        return;
      case 'Tab':
        close(false);
        return;
      default:
    }
  }

  const visibleText = selected === null ? placeholder : selected.label;

  return (
    <div className="selector" ref={rootRef} data-selector-open={open ? 'true' : 'false'}>
      <button
        type="button"
        ref={buttonRef}
        className="selector__button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        data-empty={selected === null ? 'true' : 'false'}
        onClick={() => {
          if (open) {
            close(true);
            return;
          }

          openAt(selected === null ? firstEnabled() : options.findIndex((option) => option.id === value));
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();

            if (!disabled) {
              openAt(selected === null ? firstEnabled() : options.findIndex((option) => option.id === value));
            }
          }
        }}
      >
        {selected?.icon !== undefined && (
          <span className="selector__icon" aria-hidden="true">
            {selected.icon}
          </span>
        )}
        <span className="selector__value">{visibleText}</span>
        <svg className="selector__chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>

      {open && (
        <ul
          className="selector__list"
          id={listboxId}
          role="listbox"
          aria-label={label}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              role="option"
              aria-selected={option.id === value}
              aria-disabled={option.disabled === true}
              tabIndex={-1}
              className="selector__option"
              data-disabled={option.disabled === true ? 'true' : 'false'}
              onClick={() => {
                choose(index);
              }}
            >
              <span className="selector__option-label">{option.label}</span>
              {option.description !== undefined && (
                <span className="selector__option-description">{option.description}</span>
              )}
              {/* 選中標記：右對齊的勾。未選中時仍佔位（visibility），
                  否則清單一選就會左右跳。 */}
              <svg
                className="selector__option-check"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d="m5 12 5 5L20 7" />
              </svg>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
