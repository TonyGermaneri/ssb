#pragma once

// Adaptive just intonation: a chord's fifths and thirds go pure while the keyboard stays close to
// equal temperament. A port of src/audio/adaptiveTuning.ts, which explains the method and where its
// numbers come from: keep the two in step (EngineTest replays adaptiveTuning.test.ts's fixture
// through this one).
//
// No allocation and no locks: chord() runs on the audio thread, at a note-on.

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <limits>

namespace ssb
{

enum class TuningMode : uint8_t { et, eased, strict, septimal, tonal };

class AdaptiveTuner
{
public:
    using Ages = std::array<double, 12>;

    TuningMode mode { TuningMode::eased };
    double line { 0 };
    int centre { -1 };

    /** The tuning of a pitch class: the chord's for its notes, the line for anything else. */
    double cents (int pc) const noexcept
    {
        const int i = mod12 (pc);
        return (chordMask & (1 << i)) ? tuned[(size_t) i] : line;
    }

    void reset() noexcept
    {
        line = 0;
        centre = -1;
        tuned.fill (0);
        chordMask = sevenths = 0;
        ringCount = ringNext = 0;
        lastChord = ringAt = -inf;
    }

    /** A note came on. Each pitch class's oldest note down, in seconds (< 0: none), and the same with release tails. */
    void chord (const Ages& held, const Ages& ringing, double now) noexcept
    {
        int mask = 0, nowHeard = 0;
        bool silence = true;
        for (int pc = 0; pc < 12; ++pc)
        {
            if (held[(size_t) pc] >= 0) mask |= 1 << pc;
            if (ringing[(size_t) pc] >= heardAfter) nowHeard |= 1 << pc;
            if (ringing[(size_t) pc] > 0) silence = false;
        }
        if (mask == 0) return;
        if (silence)
        {
            const double gap = now - lastChord;
            line *= std::exp (-gap / lineMemory);
            if (gap > lineMemory) chordMask = 0;
        }
        lastChord = now;
        if ((mask & ~chordMask) == 0) return;

        heard = nowHeard;
        int natural = analyse (mask, held);
        if (mode == TuningMode::tonal) blendBasis (mask, now);
        if (mode != TuningMode::septimal) natural = 0;

        const int fixedNotes = nowHeard & mask & ~natural & ~sevenths;
        const double newLine = solveLine (fixedNotes);
        if (mode != TuningMode::strict && mode != TuningMode::septimal)
        {
            double step = 0;
            for (int pc = 0; pc < 12; ++pc)
                if (fixedNotes & (1 << pc))
                    step = std::max (step, std::abs (pos[(size_t) pc] + newLine - tuned[(size_t) pc]));
            if (step > easeFrom)
            {
                const double ease = std::clamp (1 + easeSlope * easeFrom - easeSlope * step, easeLimit, 1.0);
                for (auto& p : pos) p *= ease;
            }
        }
        line = newLine;
        for (int pc = 0; pc < 12; ++pc)
            if (mask & (1 << pc)) tuned[(size_t) pc] = pos[(size_t) pc] + newLine;
        chordMask = mask;
        sevenths = natural;
    }

private:
    static constexpr double inf = std::numeric_limits<double>::infinity();
    static constexpr int ringSize = 10;
    static constexpr double lineLimit = 20, heardAfter = 0.03, stepBase = 3, stepGrows = 11, stepGrowth = 4.0 / 7.0;
    static constexpr double lineReturn = 4, lineMemory = 3, easeFrom = 4.65, easeSlope = 0.086, easeLimit = 0.5;
    static constexpr double temperedSeventh = 6;
    static constexpr std::array<int, 6> chainSemis { { 0, 4, 7, 11, 14, 18 } };
    static constexpr std::array<int, 12> basis { { 10, -6, 3, 0, -3, 6, -10, 6, -3, 0, 3, -6 } };

    static int mod12 (int pc) noexcept { return (pc % 12 + 12) % 12; }
    static int bit (int pc) noexcept { return 1 << mod12 (pc); }
    static double just (double ratio, double tempered) noexcept { return 1200.0 * std::log2 (ratio) - tempered; }
    static double toward (double v, double to, double by) noexcept { return v > to ? std::max (to, v - by) : std::min (to, v + by); }

    static inline const double third = just (5.0 / 4.0, 400), fifth = just (3.0 / 2.0, 700), ninth = just (9.0 / 8.0, 200);
    static inline const double naturalSeventh = just (7.0 / 4.0, 1000);
    static inline const double triadRoot = -(third + fifth) / 3;
    static inline const std::array<double, 6> chainCents { { 0, third, fifth, fifth + third, 2 * fifth, 2 * fifth + third } };

    std::array<double, 12> tuned {}, pos {}, scratch {};
    std::array<int, 12> order {};
    int chordMask { 0 }, sevenths { 0 }, heard { 0 };
    double lastChord { -inf };
    std::array<double, ringSize * 12> ring {};
    int ringNext { 0 }, ringCount { 0 };
    double ringAt { -inf };

    int analyse (int mask, const Ages& held) noexcept
    {
        pos.fill (0);
        const int whole = fit (mask);
        if (whole >= 0) return whole;
        int n = 0;
        for (int pc = 0; pc < 12; ++pc)
        {
            if (! (mask & (1 << pc))) continue;
            int i = n++;
            while (i > 0 && held[(size_t) order[(size_t) (i - 1)]] < held[(size_t) pc])
            {
                order[(size_t) i] = order[(size_t) (i - 1)];
                --i;
            }
            order[(size_t) i] = pc;
        }
        for (int k = n - 1; k >= 2; --k)
        {
            int part = 0;
            for (int i = 0; i < k; ++i) part |= 1 << order[(size_t) i];
            pos.fill (0);
            const int natural = fit (part);
            if (natural >= 0) return natural;
        }
        pos.fill (0);
        return 0;
    }

    int fit (int mask) noexcept
    {
        int count = 0;
        for (int pc = 0; pc < 12; ++pc)
            if (mask & (1 << pc)) ++count;
        if (count == 1) return 0;
        if (count == 2)
        {
            int a = -1, d = 0;
            for (int pc = 0; pc < 12; ++pc)
                if (mask & (1 << pc))
                {
                    if (a < 0) a = pc;
                    else d = pc - a;
                }
            if (d != 3 && d != 4 && d != 5 && d != 7 && d != 8 && d != 9) return -1;
        }
        if (count > 2)
        {
            const bool natural = mode == TuningMode::septimal;
            for (int r = 0; r < 12; ++r)
            {
                const int shell = bit (r) | bit (r + 4) | bit (r + 10) | (natural ? 0 : bit (r + 7));
                if ((mask & shell) != shell || (mask & ~(shell | bit (r + 7) | bit (r + 2)))) continue;
                pos[(size_t) r] = triadRoot;
                pos[(size_t) mod12 (r + 4)] = triadRoot + third;
                pos[(size_t) mod12 (r + 7)] = (mask & bit (r + 7)) ? triadRoot + fifth : 0;
                pos[(size_t) mod12 (r + 10)] = triadRoot + (natural ? naturalSeventh : temperedSeventh);
                pos[(size_t) mod12 (r + 2)] = (mask & bit (r + 2)) ? triadRoot + ninth : 0;
                return natural ? bit (r + 10) : 0;
            }
        }
        double best = inf;
        for (int r = 0; r < 12; ++r)
        {
            int chain = 0;
            for (int s : chainSemis) chain |= bit (r + s);
            if (mask & ~chain) continue;
            double mean = 0;
            scratch.fill (0);
            for (size_t i = 0; i < 6; ++i)
            {
                const int pc = mod12 (r + chainSemis[i]);
                if (mask & (1 << pc))
                {
                    scratch[(size_t) pc] = chainCents[i];
                    mean += chainCents[i] / count;
                }
            }
            double cost = 0;
            for (int pc = 0; pc < 12; ++pc)
            {
                if (! (mask & (1 << pc))) continue;
                scratch[(size_t) pc] -= mean;
                if (heard & (1 << pc))
                    cost = std::max (cost, std::abs (scratch[(size_t) pc] + line - tuned[(size_t) pc]));
            }
            if (cost < best - 1e-9)
            {
                best = cost;
                pos = scratch;
            }
        }
        return best < inf ? 0 : -1;
    }

    void blendBasis (int mask, double now) noexcept
    {
        if (mask & (mask - 1))
        {
            if (ringCount == 0 || now - ringAt >= heardAfter)
            {
                ringNext = (ringNext + 1) % ringSize;
                ringCount = std::min (ringSize, ringCount + 1);
            }
            ringAt = now;
            std::copy (pos.begin(), pos.end(), ring.begin() + ringNext * 12);
        }
        double top = 0;
        for (int pc = 0; pc < 12; ++pc)
        {
            double sum = 0;
            for (int c = 0; c < ringCount; ++c)
                sum += ring[(size_t) (((ringNext + ringSize - c) % ringSize) * 12 + pc)];
            if (sum > top || (sum == top && pc == centre))
            {
                top = sum;
                centre = pc;
            }
        }
        if (centre < 0) return;
        const double weight = top < 5 ? 0 : top < 15 ? 0.1 : top < 30 ? 0.2 : 0.3;
        for (int pc = 0; pc < 12; ++pc)
            if (mask & (1 << pc))
                pos[(size_t) pc] = (1 - weight) * pos[(size_t) pc] + weight * basis[(size_t) ((pc - centre + 12) % 12)];
    }

    double solveLine (int fixedNotes) const noexcept
    {
        double lo = inf, hi = -inf;
        for (int pc = 0; pc < 12; ++pc)
        {
            if (! (fixedNotes & (1 << pc))) continue;
            const double stay = tuned[(size_t) pc] - pos[(size_t) pc];
            lo = std::min (lo, stay);
            hi = std::max (hi, stay);
        }
        if (lo > hi) return toward (line, 0, lineReturn);
        const double from = hi - stepBase, to = lo + stepBase;
        if (from > to) return std::clamp ((lo + hi) / 2, -lineLimit, lineLimit);
        double l = std::clamp (0.0, from, to);
        if (l < -stepGrows) l = -(stepGrows * stepGrowth - lo - stepBase) / (1 + stepGrowth);
        else if (l > stepGrows) l = (hi - stepBase + stepGrows * stepGrowth) / (1 + stepGrowth);
        const double back = toward (line, 0, lineReturn);
        if (std::abs (back) > std::abs (l)) l = std::clamp (back, from, to);
        return std::clamp (l, -lineLimit, lineLimit);
    }
};

} // namespace ssb
