import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleHelp, Command, Crosshair, Focus, ListMusic, Settings2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLatticeControlsStore } from '../../../stores/useLatticeControlsStore';
import { useLatticeSettingsStore } from '../../../stores/useLatticeSettingsStore';
import { openCommandPalette, openCommandPaletteCommand } from '../../../stores/useAppViewStore';
import { PRIMARY_MODIFIER_LABEL } from '../../../utils/platform';
import { SlideActionButton } from '../../shared/SlideActionButton';
import './LatticeFocusButton.css';

// src/components/app/lattice/LatticeFocusButton.tsx
// A compact Lattice-only utility panel. It borrows UnifiedPanel's anchored glass surface without
// bringing its cover, tabs or player-only state into the poster wall.
export default function LatticeFocusButton({ isDaylight }: { isDaylight: boolean }) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const focusCurrentSong = useLatticeControlsStore(state => state.focusCurrentSong);
    const autoFocusOnSongChange = useLatticeSettingsStore(state => state.autoFocusOnSongChange);
    const handleToggleAutoFocusOnSongChange = useLatticeSettingsStore(state => state.handleToggleAutoFocusOnSongChange);
    const queueShortcut = `${PRIMARY_MODIFIER_LABEL}+P`;

    useEffect(() => {
        if (!isOpen) return undefined;

        const handlePointerDown = (event: PointerEvent) => {
            if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
                setIsOpen(false);
                setShowHelp(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
                setShowHelp(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const handleFocusCurrentSong = () => {
        focusCurrentSong?.();
        setIsOpen(false);
        setShowHelp(false);
    };

    const handleOpenQueueCommand = () => {
        setIsOpen(false);
        setShowHelp(false);
        openCommandPaletteCommand('queue');
    };

    const handleOpenCommandPalette = () => {
        setIsOpen(false);
        setShowHelp(false);
        openCommandPalette();
    };

    const panelId = 'lattice-tools-panel';
    const helpId = 'lattice-tools-help';

    return (
        <div ref={rootRef} className={`lattice-tools group ${isDaylight ? 'is-daylight' : ''}`}>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        id={panelId}
                        role="menu"
                        aria-label={t('home.latticeTools')}
                        initial={{ opacity: 0, scale: 0.9, originX: 1, originY: 1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="lattice-tools-panel"
                    >
                        <button
                            type="button"
                            role="menuitem"
                            className="lattice-tools-action"
                            onClick={handleFocusCurrentSong}
                            disabled={!focusCurrentSong}
                        >
                            <Crosshair aria-hidden="true" />
                            <span>{t('home.latticeFocusCurrent')}</span>
                            <kbd aria-hidden="true">Shift + ; + C</kbd>
                        </button>
                        <button
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={autoFocusOnSongChange}
                            className="lattice-tools-action"
                            onClick={() => handleToggleAutoFocusOnSongChange(!autoFocusOnSongChange)}
                        >
                            <Focus aria-hidden="true" />
                            <span>{t('home.latticeAutoFocusOnSongChange')}</span>
                            <span className={`lattice-tools-toggle ${autoFocusOnSongChange ? 'is-on' : ''}`} aria-hidden="true">
                                <span />
                            </span>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="lattice-tools-action"
                            onClick={handleOpenQueueCommand}
                        >
                            <ListMusic aria-hidden="true" />
                            <span>{t('home.latticeOpenQueueCommand')}</span>
                            <kbd>{queueShortcut}</kbd>
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            className="lattice-tools-action lattice-tools-help-trigger"
                            aria-label={t('home.latticeHelp')}
                            title={t('home.latticeHelp')}
                            aria-expanded={showHelp}
                            aria-controls={helpId}
                            onClick={() => setShowHelp(visible => !visible)}
                        >
                            <CircleHelp aria-hidden="true" />
                        </button>
                        <AnimatePresence initial={false}>
                            {showHelp && (
                                <motion.div
                                    id={helpId}
                                    role="note"
                                    className="lattice-tools-help"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.18, ease: 'easeOut' }}
                                >
                                    <ul>
                                        <li>{t('home.latticeHelpPoster')}</li>
                                        <li>{t('home.latticeHelpMove')}</li>
                                        <li>{t('home.latticeHelpCommands')}</li>
                                        <li>{t('home.latticeHelpOpen', { modifier: PRIMARY_MODIFIER_LABEL })}</li>
                                    </ul>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            <SlideActionButton
                icon={isOpen ? X : Settings2}
                title={t('home.latticeTools')}
                onActivate={() => setIsOpen(open => {
                    if (open) setShowHelp(false);
                    return !open;
                })}
                slideIcon={Command}
                slideTitle={t('options.gridSlideTargetCommandPalette')}
                onSlide={handleOpenCommandPalette}
                isDaylight={isDaylight}
                accentColor="var(--text-accent)"
            />
        </div>
    );
}
