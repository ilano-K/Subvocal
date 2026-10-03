from fastapi import Request, status
from fastapi.responses import JSONResponse

from app.core.errors import (
    AppError,
    CompileFailed,
    FileTooLarge,
    LLMConnectionError,
    LLMValidationFailed,
    NotFoundError,
    ProcessingError,
    UnsupportedFileType,
    ValidationError,
    TTSUnavailable,
    TTSVoiceNotFound,
    TTSInstallConflict,
    InsufficientDiskSpace
)

ERROR_STATUS_CODES: dict[type[AppError], int] = {
    ValidationError: status.HTTP_400_BAD_REQUEST,
    LLMValidationFailed: status.HTTP_422_UNPROCESSABLE_CONTENT,
    LLMConnectionError: status.HTTP_502_BAD_GATEWAY,
    FileTooLarge: status.HTTP_413_CONTENT_TOO_LARGE,
    UnsupportedFileType: status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
    ProcessingError: status.HTTP_500_INTERNAL_SERVER_ERROR,
    NotFoundError: status.HTTP_404_NOT_FOUND,
    CompileFailed: status.HTTP_422_UNPROCESSABLE_CONTENT,
    TTSUnavailable: status.HTTP_503_SERVICE_UNAVAILABLE,
    TTSVoiceNotFound: status.HTTP_400_BAD_REQUEST,
    TTSInstallConflict: status.HTTP_409_CONFLICT,
    InsufficientDiskSpace: status.HTTP_507_INSUFFICIENT_STORAGE
}

async def app_error_handler(
    request: Request,
    exc: AppError,
) -> JSONResponse:
    status_code = ERROR_STATUS_CODES.get(
        type(exc),
        status.HTTP_500_INTERNAL_SERVER_ERROR
    )
    return JSONResponse(
        status_code=status_code,
        content={
            "error": exc.__class__.__name__,
            "message": str(exc)
        },
    )