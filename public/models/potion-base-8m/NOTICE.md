# potion-base-8M

Static text embeddings by [MinishLab](https://github.com/MinishLab/model2vec) (Model2Vec, distilled from
BAAI's bge-base-en-v1.5): [minishlab/potion-base-8M](https://huggingface.co/minishlab/potion-base-8M) at revision `bf8b056651a2c21b8d2565580b8569da283cab23`, MIT licence.

Repacked by `scripts/model2vec.mjs`: `vocab.txt` is its tokenizer's WordPiece vocabulary in id order;
`vectors.bin` its 29528 × 256 embedding table as int8 with a float32 scale per row.

MIT License — Copyright (c) 2024 Thomas van Dongen (as github.com/MinishLab/model2vec states it)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
