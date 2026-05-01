Switching to **OpenRouter** is a smooth move for the **Ashyq Bilim** backend because OpenRouter is fully OpenAI-compatible. Since you are already using `pydantic-ai` and the `openai` SDK, you won’t need to swap out your core dependencies—just a few configuration tweaks.

Here is how to bridge the gap.

### 1. Update Environment Variables

OpenRouter uses the OpenAI SDK structure but requires its own base URL and specific model identifiers. Update your `.env` or `pydantic-settings` to include:

```bash
# OpenRouter configuration
OPENROUTER_API_KEY=your_openrouter_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Optional but recommended for OpenRouter rankings
APP_URL=https://cs-mooc.tou.edu.kz
APP_NAME="Ashyq Bilim"
```

---

### 2. Configure PydanticAI for OpenRouter

Since you are using `pydantic-ai-slim[openai]`, you can initialize the `OpenAIModel` by pointing it to the OpenRouter endpoint.

```python
from pydantic_ai.models.openai import OpenAIModel
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openrouter_api_key: str
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # For OpenRouter headers
    app_url: str = "https://cs-mooc.tou.edu.kz"
    app_name: str = "Ashyq Bilim"

settings = Settings()

# Initialize the OpenRouter-powered model
model = OpenAIModel(
    model_name='deepseek/deepseek-v4-flash',
    base_url=settings.openrouter_base_url,
    api_key=settings.openrouter_api_key,
    additional_headers={
        "HTTP-Referer": settings.app_url,
        "X-Title": settings.app_name,
    }
)
```

---

### 3. Usage with LangGraph / OpenAI SDK

If you use the raw `AsyncOpenAI` client anywhere in your FastAPI routes or LangGraph nodes, configure it similarly:

```python
from openai import AsyncOpenAI

client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=settings.openrouter_api_key,
)

response = await client.chat.completions.create(
    model="deepseek/deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

---

### 4. Model Identifier Reference

OpenRouter uses a `provider/model` format. To support the models you mentioned, use these strings in your `model_name`:

| Target Model          | OpenRouter Model String      |
| :-------------------- | :--------------------------- |
| **DeepSeek V4 Flash** | `deepseek/deepseek-v4-flash` |

---

* **Streaming:** OpenRouter supports Server-Sent Events (SSE) just like OpenAI, so your FastAPI streaming responses will continue to work without modification.

switch:

Models & Pricing
The prices listed below are in units of per 1M tokens. A token, the smallest unit of text that the model recognizes, can be a word, a number, or even a punctuation mark. We will bill based on the total number of input and output tokens by the model.

Model Details
MODEL deepseek-v4-flash(1) deepseek-v4-pro
BASE URL (OpenAI Format) <https://api.deepseek.com>
BASE URL (Anthropic Format) <https://api.deepseek.com/anthropic>
MODEL VERSION DeepSeek-V4-Flash DeepSeek-V4-Pro
THINKING MODE Supports both non-thinking and thinking (default) modes
See Thinking Mode for how to switch
CONTEXT LENGTH 1M
MAX OUTPUT MAXIMUM: 384K
FEATURES Json Output ✓ ✓
Tool Calls ✓ ✓
Chat Prefix Completion（Beta） ✓ ✓
FIM Completion（Beta） Non-thinking mode only Non-thinking mode only
PRICING 1M INPUT TOKENS (CACHE HIT)(2) $0.0028 $0.003625 (75% off(3))$0.0145
1M INPUT TOKENS (CACHE MISS) $0.14 $0.435 (75% off(3))$1.74
1M OUTPUT TOKENS $0.28 $0.87 (75% off(3))$3.48
(1) The model names deepseek-chat and deepseek-reasoner will be deprecated in the future. For compatibility, they correspond to the non-thinking mode and thinking mode of deepseek-v4-flash, respectively.
(2) For all models, the input cache hit price has been reduced to 1/10 of the launch price. This price adjustment takes effect from 2026/4/26 12:15 UTC.
(3) The deepseek-v4-pro model is currently offered at a 75% discount, extended until 2026/05/31 15:59 UTC.

Deduction Rules
The expense = number of tokens × price. The corresponding fees will be directly deducted from your topped-up balance or granted balance, with a preference for using the granted balance first when both balances are available.

Product prices may vary and DeepSeek reserves the right to adjust them. We recommend topping up based on your actual usage and regularly checking this page for the most recent pricing information.

DeepSeek: DeepSeek V4 Flash
deepseek/deepseek-v4-flash

Chat
Compare
Released Apr 24, 2026
1,048,576 context
$0.14/M input tokens
$0.28/M output tokens

Academia (#4)

Finance (#30)

Health (#17)

Legal (#6)

Marketing (#20)

+7 categories
DeepSeek V4 Flash is an efficiency-optimized Mixture-of-Experts model from DeepSeek with 284B total parameters and 13B activated parameters, supporting a 1M-token context window. It is designed for fast inference and high-throughput workloads, while maintaining strong reasoning and coding performance.

The model includes hybrid attention for efficient long-context processing. Reasoning efforts high and xhigh are supported; xhigh maps to max reasoning. It is well suited for applications such as coding assistants, chat systems, and agent workflows where responsiveness and cost efficiency are important.

Standard
Model weights
Overview
Playground
Providers
Performance
Pricing
Benchmarks
Apps
Activity
Uptime
API
Providers for DeepSeek V4 Flash

OpenRouter routes requests to the best providers that are able to handle your prompt size and parameters, with fallbacks to maximize uptime.

Filter quantization

Sort by
DeepSeek

CN
Latency
0.83s
Throughput
67tps
Uptime
Uptime 100.0 percent

Total Context
1.05M
Max Output
384K
Input Price
$0.14
/M tokens
Output Price
$0.28
/M tokens
Cache Read
$0.0028
/M tokens
SiliconFlow

SG
fp8
Latency
1.18s
Throughput
61tps
Uptime
Uptime 100.0 percent

Total Context
1.05M
Max Output
393.2K
Input Price
$0.14
/M tokens
Output Price
$0.28
/M tokens
Cache Read
$0.028
/M tokens
Parasail

US
fp8
Latency
2.80s
Throughput
15tps
Uptime
Uptime 99.8 percent

Total Context
1.05M
Max Output
1.05M
Input Price
$0.14
/M tokens
Output Price
$0.28
/M tokens
Cache Read
$0.07
/M tokens
AtlasCloud

US
fp8
Latency
0.80s
Throughput
67tps
Uptime
Uptime 99.9 percent

Total Context
1.05M
Max Output
393.2K
Input Price
$0.14
/M tokens
Output Price
$0.28
/M tokens
Cache Read
$0.028
/M tokens
DeepInfra

US
fp4
Latency
1.29s
Throughput
8tps
Uptime
Uptime 93.6 percent

Total Context
1.05M
Max Output
16.4K
Input Price
$0.14
/M tokens
Output Price
$0.28
/M tokens
Cache Read
$0.028
/M tokens
NovitaAI

US
Latency
0.86s
Throughput
60tps
Uptime
Uptime 99.9 percent

Total Context
1.05M
Max Output
393.2K
Input Price
$0.14
/M tokens
Output Price
$0.28
/M tokens
Cache Read
$0.028
/M tokens
